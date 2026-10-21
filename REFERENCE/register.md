# The parameter register

**When to read this:** adding or changing a register row, reading parameters in the engine, refreshing a data snapshot, or checking where a number comes from.

Every number the engine uses comes from one file, [`data/register.json`](../data/register.json). Only physical constants and unit conversions live in code. Why it works this way is in the [typed parameter register ADR](./decisions/2026-10-17-typed-parameter-register.md). Why the data is snapshotted at build time is in the [client-side snapshots ADR](./decisions/2026-10-17-client-side-build-time-snapshots.md).

## Files

| File | What it does |
| --- | --- |
| `data/register.json` | The rows, in one `{ "rows": [...] }` object |
| `data/snapshots/pvgis-tmy-london.json` | The PVGIS typical year for London, referenced by a `series` row |
| `data/snapshots/pvgis-pvcalc-london.json` | PVGIS PVcalc's yield for the pre-registered reference PV system, for the PV check (not a register row) |
| `data/snapshots/octopus-london.json` | Octopus's London tariffs: Agile's past 12 months on the typical year, Cosy by local hour, and the export rates, referenced by a `series` row |
| `src/register/schema.ts` | Zod schemas for the row kinds, provenance and integrity rules |
| `src/register/load.ts` | `loadRegister(parsed)`: validates an already-parsed object, with no file reads; `staleRows(register, asOf)` |
| `src/register/ids.ts` | `ROW_IDS` and the `RowId` union |
| `src/register/access.ts` | `createAccessor(register)`: typed reads that throw on an unknown id, an unknown table key or the wrong kind |
| `src/snapshots/pvgisSchema.ts` | The snapshot schema and `loadPvgisSnapshot(parsed)` |
| `src/snapshots/octopusSchema.ts` | The Octopus snapshot schema and `loadOctopusSnapshot(parsed)` |
| `scripts/fetch-octopus.ts`, `scripts/octopus/build.ts` | Fetch the Octopus pages and build and write the Octopus snapshot (`npm run fetch:octopus`) |
| `scripts/fetch-pvgis.ts`, `scripts/pvgis/trim.ts` | Fetch, trim and write the PVGIS snapshot |
| `scripts/pvgis/pvcalcCheck.ts`, `scripts/pvgis/pvcalc.ts`, `scripts/fetch-pvcalc.ts` | The pre-registered PV check, and the fetch, trim and schema of the PVcalc snapshot |
| `scripts/baseProfile/`, `scripts/derive-base-profile.ts` | Derive the base electricity profile rows from Elexon's profile class 1 spreadsheet (`npm run derive:base-profile`) |
| `scripts/calibration/setpoint.ts`, `scripts/calibrate.ts` | The calibration of the heating setpoint (`npm run calibrate`) |
| `scripts/archetypes/needReadings.ts` | The pre-registered NEED readings T and S for each archetype, and the flag rule |

## Reading the register

```typescript
import { createAccessor } from './register/access.ts';
import { loadRegister } from './register/load.ts';

const access = createAccessor(loadRegister(parsedJson)); // the caller reads and parses the file
const doorArea = access.fixed('geometry.doorArea').value;
const spf = access.uncertain('heating.heatPumpSpf'); // default, low, high, distribution, median, sigma
const roofU = access.cellNumber('fabric.roofUValue', 'about100mm'); // a table cell
const band = access.cellString('archetypes.ageBand', 'semi1930s'); // a categorical cell
```

The accessor takes a `RowId`, so a misspelt id fails type checking. At run time it throws an error naming the id if the row is missing, and it throws if the row is a different kind from the one asked for. `cell`, `cellNumber` and `cellString` throw an error naming the row and the key if the key is missing, if a fixed read meets an uncertain cell, or if the cell holds the other type. `correlations()` lists the correlation rows.

## Row fields

Every row has `id`, `kind`, `section`, `label`, `unit`, `status`, `lastChecked` (YYYY-MM-DD), `refreshCadence` (`quarterly`, `yearly`, `static` or a whole number of months), `overridable`, `overrideHint` (text, or `null`) and `dependsOn` (row ids).

**Provenance depends on the status:**
- `sourced` (checked against the source on `lastChecked`) and `to-verify` (taken from the source, not yet checked line by line) need `source: { title, url }`.
- `approximate` (an estimate) needs a `rationale`, and may add a `source`.

Any row may carry a `rationale`, and most do. Any row may also carry `validUntil` (YYYY-MM-DD), the last day its value applies, such as the end of a price cap period. It must not be before `lastChecked`.

**Value fields depend on the kind:**

| Kind | Fields | Notes |
| --- | --- | --- |
| `uncertain` | `default`, `low`, `high`, `distribution` | `triangular`: `default` is the mode. `lognormal`: also `median` and `sigma`; `default` equals `median`, and draws are clipped to `low`–`high`. |
| `fixed` | `value` | |
| `series` | `file`, `schema`, `columns` | `schema` names a snapshot schema (`pvgis-tmy` or `octopus-london`) |
| `profile` | `values`, `resolution` | `hour-of-day` needs 24 values, `hour-of-week` 168 (Monday 00:00 local first), `month` 12 |
| `table` | `keyedBy`, `cells` | Each cell is `{ key, value }` (a number, or a string for a categorical fact) or an uncertain cell `{ key, default, low, high, distribution, … }`. Keys are unique and contain no `\|`. A compound key joins its parts with `/` in one order: age band, then construction, then answer (`C/cavity`, `C/cavity/cavityFilled`). |
| `correlation` | `value`, `between` | A correlation in normal-score space, strictly between −1 and 1, between two uncertain rows. The first is the anchor. |

Unknown fields are rejected, so a typo such as `defualt` fails.

## Integrity rules

`loadRegister` throws a `RegisterValidationError`. Its `problems` list names each row by id and position, and names the field, for example `Row "heating.heatPumpSpf" (rows[26]), field "default": (3) must equal median (2.8) for a lognormal row`. It fails when:
- a field required by the row's kind or status is missing, or has the wrong type;
- an uncertain row's default lies outside low–high, or low is above high;
- a lognormal row lacks `median` or `sigma`, its default differs from its median, or its sigma is not positive; a triangular row carries either field;
- a profile has the wrong number of values;
- two rows share an id;
- a `dependsOn` entry names a missing row, or the dependencies form a cycle;
- `lastChecked` is not a real calendar date (2026-02-30 fails);
- an id does not start with its section (`fabric.wallUValue` must have `section: "fabric"`);
- a source link is not `https`;
- a series row's `file` is not a JSON file in `data/snapshots/`;
- a table row has two cells with one key, a key containing `|`, or an uncertain cell with a bad range;
- a correlation row names one row twice, names a row that is not an uncertain row, leaves either row out of `dependsOn`, or names a row that another correlation already names.

Cross-row rules (duplicates, dependencies) run only once every row is valid on its own.

**Stale rows are a warning, not an error.** `dueDate(row)` is `lastChecked` plus the row's cadence, or its `validUntil` if that comes first; the four price rows fall due on 2026-12-31, when their cap period ends. `staleRows(register, asOf)` lists rows whose due date falls before `asOf`, and `npm run report` prints them as console warnings. The caller passes the date, so output never depends on the clock and the committed report stays byte-identical.

## Adding or changing a row

1. Add the row to `data/register.json`, with a source or a rationale, and set `lastChecked` to the day you checked it. A table keyed by archetype must have a cell for every archetype, and one keyed by age band a cell for every band the archetypes use; a test checks both.
2. Add its id to `ROW_IDS` in `src/register/ids.ts`. The parity test fails until the two match.
3. Fill in `dependsOn` with the rows its value was derived from.
4. If you change a row the engine reads for the gas setup of the 1930s semi (weather, archetypes, geometry, fabric, gains, boiler or hot water), run the tests: the calibration test fails if the setpoint no longer hits its target, and the row then needs re-solving with `npm run calibrate` (see below). Areas and volume are derived by the engine, so there are no geometry rows to keep in step.

## The rows

**Archetypes.** Ten house types, each keyed to one RdSAP age band (see the [phase 2 spec](../SPECIFICATIONS/02-complete-v1-model.md), "House types and geometry"). The 1930s semi is the phase 1 house: about 90 m², two storeys, 100 mm of loft insulation and double glazing installed before 2002. Its cavity walls are filled by default, because 73% of owner-occupied cavity-walled homes have cavity wall insulation (English Housing Survey 2024 to 2025). Phase 1 had them unfilled; the `asBuilt` answer gives that house.

| Section | Rows |
| --- | --- |
| weather | The PVGIS typical year (series); an outdoor-temperature offset (0 K, for tests); the minute past each hour that the irradiance values describe (10) |
| archetypes | By archetype: house type, age band, storeys, wall construction, default floor area (English Housing Survey 2012), bedrooms (NEED), aspect ratio, party walls and default quick-facts answers. By age band: room height, window area formula (RdSAP 2012 Table S4), ground floor construction and insulation (RdSAP 10 Table 19). Wall thickness by band and construction (Table 3); the upper-storey allowance (0.25 m); SAP's occupancy formula |
| geometry | The door area (1.85 m²) |
| fabric | U-values from RdSAP 10: walls by band, construction and wall answer (Table 6 and §5.7–5.8), party walls by construction (Table 15), windows by glazing answer (Table 24), doors by band (Table 26), roofs by loft answer (Table 16); the curtain resistance (SAP 10.2 §3.2); thermal bridging by band (Table 21); the ISO 13370 ground floor parameters (§5.12); the air change rate by band (approximate); the uncertain fabric quality factor (0.75–1.15); the thermal mass parameter by construction (250 kJ/m²K for masonry, Table 22) |
| gains | Internal gains per m² (fixed) and per occupant (uncertain, 75–140 W); their correlation with hot water per occupant (0.5); g⊥ by glazing answer (Table 24), SAP's 0.9 for non-normal incidence, the frame factor (0.7) and solar access factor (0.77); ground reflectance (0.2) |
| heating | The setpoint (17.6 °C air, calibrated, see below); the control boost (uncertain, 1–2 K, mode 1.5) and preheat lead time (3 hours) for the heat pump on a time-of-use tariff; the heating periods by hour of the week for the gas setups (SAP's pattern) and the heat pump setups (07:00–23:00 every day); the output caps: the boiler's 24 kW and the heat pump's design temperature difference (24.2 K, SAP 10.2 Appendix N) and margin (1.15, HeatpumpMonitor.org); boiler seasonal efficiency (0.80–0.89); boiler pump and fan electricity (86 kWh a year, SAP 10.2 Table 4f); heat pump SPF (Electrification of Heat SPFH4: lognormal, median 2.8, sigma 0.145, clipped to 2.0–4.0, including hot water) and the well-installed scenario's SPF (HeatpumpMonitor.org: median 3.9, sigma 0.14, clipped to 2.8–5.4); the standby share of the heat pump's electricity, inside the SPF (trial daily data: median 5.9%, clipped to 1–25%; well-installed: median 2.5%, clipped to 0.5–10%); the COP curve's lift allowance (10 K), shape clamp (4–15) and ceiling (7); the compensation line's outdoor endpoints (−2 and 15 °C) and its flow temperatures (uncertain: 35–50 °C at design, 25–35 °C mild) |
| hotWater | Litres a day: 36 per household plus 25 per occupant (uncertain, 17–35); delivery and cold-feed temperatures; the hourly draw-off profile (Energy Saving Trust, 2008; local time, shares summing to 1); for the heat pump setups, the hot water flow temperature (50 °C), and the cylinder's volume (200 litres), setpoint (50 °C), reheat trigger (45 °C) and standing loss |
| prices | Ofgem price cap for the London region by Direct Debit, 1 October–31 December 2026, checked on 21 October 2026; today's VAT on electricity (0, until 31 March 2027); the flat export rate (uncertain, 4.1–15p/kWh, mode 12p, Outgoing Octopus in London, from the Octopus snapshot); the real price changes a year for gas and electricity (uncertain, −3% to +3%, mode 0) and their correlation (0.6) |
| carbon | Natural gas factor 0.18231 kgCO₂e/kWh (gross CV, DESNZ 2026 flat file); grid electricity factor 0.14396 kgCO₂e/kWh (DESNZ 2026 set, electricity consumed, including transmission and distribution losses) |
| electricity | Base electricity use, from Ofgem's 2026 typical consumption values (1,600–3,800 kWh, mode 2,500); its hour-of-week shape and month level (Elexon profile class 1, see below) |
| solar | System size (uncertain, 2.5–6 kWp, mode 4, clipped to the roof); tilt and roof pitch (35°); direction (uncertain, −45° to +45° from south, mode south); system loss (14%, PVGIS's default); temperature coefficient (−0.4% per K); cell temperature rise (0.031 K per W/m², NOCT 45 °C); usable share of one roof slope (uncertain, 0.5–0.85, mode 0.7); kWp per m² (0.2) |
| tariffs | The Octopus snapshot (series); Cosy's unit rates by local hour and its standing charge; Agile's standing charge; the share of each day's hours that control treats as cheap, and as peak, on Agile (a quarter) |
| costs | Installed costs: a replacement combi boiler (uncertain, £2,000–£4,500, mode £3,000; approximate), an air source heat pump with its cylinder and radiator changes (Boiler Upgrade Scheme statistics: lognormal, median £12,900, sigma 0.25, clipped to £8,000–£22,000) and PV per kWp (DESNZ solar PV cost data: £1,250–£2,500, mode £1,700); the Boiler Upgrade Scheme grant (£7,500, checked monthly); lifetimes (heat pump 13–22 years, mode 18; boiler 10–16, mode 13; PV 22–30, mode 25; all approximate) |

**The tariff rows (21 October 2026).** Magnus approved the downloads on 21 October 2026 in one batch.
- **The price cap** rows are the London region's, from Ofgem's regional tables on its price cap page (the tables load from Everviz; the two Direct Debit tables are kept in the gitignored `REFERENCE/data-downloads/ofgem/`). London's electricity unit rate is 26.60p (GB 26.32p) and its standing charge 42.92p a day (GB 54.83p); gas is 8.15p and 30.20p (GB 7.97p and 29.68p). Electricity carries no VAT from 1 October 2026 to 31 March 2027 (`prices.electricityVatRate`).
- **Cosy and Agile** come from the Octopus snapshot (see "The Octopus snapshot"). `tariffs.cosyUnitRate` is a profile row by local hour; a test checks it, both standing charges and the export row's mode against the snapshot, so a refreshed snapshot that isn't copied into the register fails.
- **`tariffs.agileCheapPeakShare` (0.25) and `heating.preheatLeadTime` (3 hours)** are approximate method choices from the spec, each with its reason; `heating.controlBoost` is uncertain and approximate, 1–2 K as the spec sets. See the [tariff control ADR](./decisions/2026-10-21-rule-based-tariff-control.md).

**The gas carbon factor (21 October 2026, closes [#8](https://github.com/mannepanne/energy-sim/issues/8)).** Checked in DESNZ's 2026 flat file (version 1.2, revised July 2026; `ghg-conversion-factors-2026-flat-format-revised.xlsx`, 515,426 bytes, SHA-256 a9a455ab…7feecd5e, kept in `REFERENCE/data-downloads/desnz/`): Natural gas, kWh (Gross CV), Scope 1, 0.18231 kgCO₂e (factor ID 1_100_1004_6_1), against 0.18296 before. The same file confirms the grid electricity factor's two parts (0.13096 and 0.01299).

**The RdSAP check (18 October 2026, [#9](https://github.com/mannepanne/energy-sim/issues/9)).** Every RdSAP-sourced row was checked line by line against the RdSAP 10 specification (9 June 2025) and marked sourced. What the check changed:
- **Party walls:** a cavity party wall is not zero. Table 15 gives 0.5 unfilled, 0.2 filled and 0.25 when the construction can't be determined, which the cavity archetypes use. Solid masonry is 0.
- **Thermal bridging:** RdSAP adds y × the exposed area (Table 21), which phase 1 left out.
- **g-values:** Table 24 gives g⊥ (0.76 for double glazing before 2002, not 0.63), and SAP's 0.9 for non-normal incidence applies on top.
- **Window U-values:** curtains are added (SAP 10.2 §3.2).
- **Window areas:** RdSAP 10 measures windows and has no default formula. Phase 1's 0.122 × floor area + 6.875 comes from RdSAP 2012 Table S4, which is the cited source.
- **Loft insulation:** Table 18 assumes 100 mm for bands A–G when the thickness is unknown. Phase 1 had called "no insulation" RdSAP's default for the band.
- **The ground floor:** the U-value is computed by ISO 13370 ([#7](https://github.com/mannepanne/energy-sim/issues/7)). Table 19 gives band C a solid floor, so the 1930s semi's floor is solid at 0.66 W/m²K, not suspended timber at 0.75.

**The heat pump rows (19 October 2026).** The SPF rows and the draw-off profile are sourced. The COP curve, the flow temperatures and the cylinder rows are approximate, the flow temperatures checked against the Electrification of Heat trial and HeatpumpMonitor.org: each gives its reason in its rationale, and the ordering a test enforces (hot water flow above the design flow's high, setpoint above the reheat trigger above the cold feed). On the price cap the curve rows change when the heat pump uses electricity, not how much, because k scales the year to the sampled SPF. `heating.heatPumpSpfWellInstalled` and `heating.heatPumpStandbyShareWellInstalled` are read only in the well-installed scenario, so they are not among the default draws or in the phase 1 report's sensitivity table. See [engine.md](./engine.md#the-heat-pump-over-the-year).

**The solar rows (19 October 2026)** are all approximate, each with its reason; the system loss also cites PVGIS's suggested default as its source. Size, direction and the usable roof share are uncertain rows; the rest are fixed. The usable share is uncertain because it sets the roof's maximum, which clips the size on six of the ten house types, so on those houses it, not the size row, sets the spread of sizes. Every run reads them, so a run with solar pairs with one without. The PV check against PVGIS's calculator ([engine.md](./engine.md#checks-against-outside-references)) was pre-registered on these defaults and changed none of them.

**The heating rows (20 October 2026).** The thermal mass parameter, the gas schedule and the design temperature difference are sourced from RdSAP 10 and SAP 10.2, checked against the PDFs (Magnus approved the downloads on 20 October 2026; kept in the gitignored `REFERENCE/data-downloads/bre/`): `sap-10-2.pdf`, 3,580,635 bytes, SHA-256 8cf5d5fc…278b3, and `rdsap-10.pdf`, 2,045,896 bytes, SHA-256 abfe14a9…574b1. The gas schedule is SAP's weekday pattern on weekdays and SAP's 16-hour day at weekends, as the phase 2 spec sets; SAP 10.2's own Table 9 uses the two-period day every day. The heat pump schedule is approximate: no source gives heat pump heating hours, so it is SAP's longer heat pump day applied every day, which Magnus chose on 20 October 2026 from the evidence in the [schedules ADR](./decisions/2026-10-20-heating-schedules-one-thermal-mass-node.md). The margin is the median of 747 air source systems on HeatpumpMonitor.org (rated output ÷ design heat loss), a self-selected sample. The boiler's rated output is approximate. A schedule row must be 168 values of 0 or 1, or reading the inputs fails.

**The base electricity profile (19 October 2026)** comes from Elexon's "average profiling data per profile class" for 2013/14, evaluated at 10-year average temperatures (downloaded from Elexon's profiling page on 19 October 2026, 99,100 bytes, SHA-256 7b2bb2c7…02969; not committed). Profile class 1 gives half-hourly mean demand for five seasons × weekday, Saturday and Sunday. `npm run derive:base-profile -- <folder>` reads the unzipped spreadsheet and prints the two rows:
- **the hour-of-week shape:** each day type's hourly use (the mean of its two half-hours), averaged over that day type's days in 2026, whatever their season, scaled to a mean of 1;
- **the month level:** each month's mean daily use ÷ the year's.

Seasons follow Elexon's rules on 2026: winter from the October clock change to the day before the March one (25 October; 29 March), spring to the Friday before summer, summer the ten weeks from 16 May, high summer from 25 July to the Sunday after the August bank holiday (6 September), autumn from 7 September. Bank holidays count as their weekday. Using one weekly shape keeps the winter–summer difference in level (the month row) and loses only the small change of daily shape between seasons: a weekday's share of use between 10:00 and 16:00 is 25.5% in winter and 26.4% in summer. The engine rescales the product so the year equals `electricity.baseUse`.

**Correlations** cover uncertain rows only, not table cells, though cells have draw keys. Every house must read both rows of a correlation, or sampling throws; both correlations name rows every house reads.

The row still `to-verify` is the fabric quality factor; the gas carbon factor was checked on 21 October 2026. The heat pump SPF is sourced: the trial's interim report confirms its boundary is H4 (checked 19 October 2026).

### The cost and price scenario rows

[engine.md](./engine.md#costs-grants-and-payback) says how payback uses them. Magnus approved the downloads on 19 October 2026; the two spreadsheets are kept in `REFERENCE/data-downloads/` (gitignored, not committed).

- **The heat pump** (`costs.heatPumpInstalled`, sourced): the Boiler Upgrade Scheme statistics for August 2026 (`BUS_Statistics_August_2026.xlsx`, 1,129,161 bytes, SHA-256 ce8cd85e…f55cf), table Q1.1A. Air-to-water heat pumps redeemed in 2026 Q2 had a median reported cost of £12,908, with an interquartile range of £11,128–£15,627. The statistics' notes say the cost is self-reported on the MCS certificate, includes the system, labour and VAT, and should include the grant value, so it is before the grant; the top and bottom 10% are excluded. They don't say whether it covers the cylinder and radiator changes; the engine assumes it does. Table A1.3A gives 2025/26 medians by capacity, from £11,494 (4–6 kW) to £13,943 (10–12 kW); one row serves every archetype for now.
- **PV** (`costs.pvPerKwp`, sourced): DESNZ solar PV cost data, 2025/26, Total Installed Capacity file (`Solar_Costs_2025-26_TIC.xlsx`, 86,279 bytes, SHA-256 1ce7ec3a…a45a1ca). The 0–4 kW median is £1,595 per kW and the 4–10 kW median £1,546, but both include cheaper non-domestic installations. The domestic 0–4 kW mean is £1,955 against £1,808 for all, so the mode scales the median by that ratio, to about £1,700. Costs include VAT where it applies and exclude batteries.
- **The boiler** (`costs.boilerInstalled`, approximate): no official statistics cover it, so the row is an assumption with a written reason.
- **The grant** (`costs.boilerUpgradeSchemeGrant`, sourced): £7,500, from GOV.UK's "Apply for the Boiler Upgrade Scheme" pages, checked on 19 October 2026. Its rationale records the conditions GOV.UK lists: the applicant owns the property; the heat pump replaces a fossil fuel system; installation within 120 days of applying; no earlier government funding for a heat pump or biomass boiler; no social housing and most new builds excluded; at most 45 kWth. GOV.UK sets no EPC or insulation condition. The £1,500 oil and LPG uplift doesn't apply to v1's mains-gas homes. The BUS statistics' scheme background adds that the installer applies, deducts the grant from the price, and must be MCS-certified. The engine assumes MCS certification for the heat pump and for PV export payments. Its cadence is one month, because the scheme's terms change often.
- **The export rate** (`prices.exportRate`, uncertain and sourced): the Octopus snapshot, London region, 21 October 2026. Magnus set the range on 20 October 2026: the low end is the fixed Smart Export Guarantee tariff (`OUTGOING-SEG-FIX-12M-20-07-07`, 4.1p/kWh), the mode is Outgoing Octopus (`OUTGOING-VAR-24-10-26`, 12p/kWh from 1 March 2026; the spec's "Outgoing Fixed" is sold under this name), and the high end is Outgoing Octopus's previous 15p/kWh. Only solar setups read it, on every import tariff. A test checks the mode against the snapshot's Outgoing Octopus rate; the low and high stay at Magnus's 4.1p and 15p, which the snapshot confirmed on 21 October 2026.
- **Lifetimes and price changes** are approximate, each with its reason. The price changes are symmetric about no change, so the range favours neither fuel. PV's shortest life (22 years) is no shorter than the heat pump's longest (22 years), and a lifetime ending at the horizon is not replaced, so PV is never replaced inside a heat pump horizon.

## Overrides

Rows marked `overridable` are the ones a visitor will be able to replace with their own figure in phase 3. Floor area is an input to the engine, which derives every area and the volume from it, so a visitor's floor area flows through. User overrides of other fixed rows and cells still need their own path into the engine; that is a phase 3 decision (see [SPECIFICATIONS/CLAUDE.md](../SPECIFICATIONS/CLAUDE.md)).

## The setpoint calibration

The benchmark found that the method agrees with HEM, but that both models predict more gas than comparable homes use. The [calibration ADR](./decisions/2026-10-17-air-temperature-calibrated-to-need.md) therefore calibrates the heating behaviour to measured gas use. Phase 1 calibrated a continuous mean internal temperature; the [schedules ADR](./decisions/2026-10-20-heating-schedules-one-thermal-mass-node.md) moved the calibration to the setpoint, `heating.setpoint`, and removed `heating.meanInternalTemperature`.

- **What the row means:** a whole-house **air** temperature held during the heating periods of the gas schedule, on the thermal-mass node. It applies to both setups ("the same household, different kit") and to every archetype. It may absorb fabric error as well as heating behaviour. The row's rationale states all three points, and cites NEED as its source.
- **The target:** the 1930s semi's central annual gas use is 13,200 kWh. That is space heat plus hot water, divided by the boiler efficiency, with no cylinder loss for the combi. 13,200 kWh is the midpoint of NEED's readings A and C. The result must stay within those readings, 10,980–15,433 kWh. The target was fixed before the engine existed.
- **The method:** solve for the setpoint at which the hourly engine's central gas use for the 1930s semi equals the target, on the PVGIS year, with its derived geometry, SAP's schedule and every other row at its default. The schedule is not fitted. `npm run calibrate` prints the solved values; they are copied into the row by hand, rounded to 0.1 °C. If the solved setpoint ever falls outside 16–21 °C, stop and review it rather than force a fit (a test checks the range).
- **The value: 17.6 °C** (solved 17.56 °C on 20 October 2026), giving 13,263 kWh of central gas use. The low and high (16.2 and 18.8 °C) are the setpoints that reproduce readings A and C by the same method. They describe uncertainty about the typical home, not the spread between households.
- **The drift check:** `scripts/calibration/setpoint.test.ts` re-solves the setpoint on the real register and snapshot. It fails if the row's default, low or high is more than 0.1 °C from the solved value, or if central gas use is more than 150 kWh from the target. So a change to any row the gas setup reads, including the window and weather rows, is caught once it moves the result by more than that.
- **History:**
  - The register PR set a provisional 16.0 °C (14.8–17.1) with the benchmark's rough monthly method. The hourly re-solve replaced it with 15.7 °C (14.5–16.8), and the rough-method solver was removed.
  - The phase 2 archetypes PR re-solved it on the continuous engine with derived geometry and the checked RdSAP fabric. With the cavity as built, the heat loss coefficient rose from 302 to 341 W/K (thermal bridging adds 29 W/K, the cavity party wall 9 W/K) and the solve gave 14.6 °C. Magnus then made a filled cavity the default for bands C–G (18 October 2026), which brings H to 274 W/K and the solve to 16.3 °C (15.0–17.4). Without thermal bridging it would be 17.2 °C.
  - Up to here the row was the continuous mean internal temperature.
  - The heating schedules PR (20 October 2026) replaced it with the setpoint under SAP's schedule, on the thermal-mass node: 17.6 °C (16.2–18.8).

## The PVcalc snapshot

`data/snapshots/pvgis-pvcalc-london.json` holds PVGIS PVcalc's annual and monthly yield and in-plane irradiation for the reference system, with its loss breakdown (reflection, spectral, temperature and low irradiance, total), the request URL, the fetch date and the SHA-256 of the raw response. It was fetched once, on 19 October 2026, after the check was pre-registered. `npm run fetch:pvcalc` refetches it; `npm run fetch:pvcalc -- <saved response> <YYYY-MM-DD>` trims a saved response instead. A refetch may move PVcalc's figure (PVGIS updates its databases), so rerun the check test and update its pinned gap in the same PR.

## The Octopus snapshot

`npm run fetch:octopus` fetches Octopus's public API (no key) for London (region C), Direct Debit, single register, and writes `data/snapshots/octopus-london.json`. Run it only when the snapshot should change, because it needs network access; then copy the new values into the register rows the test names, run `npm run report`, and commit.

- **Agile:** the last full 12 months before the month of the fetch, in UTC (for the fetch on 21 October 2026, 1 October 2025 to 30 September 2026). The fetch asks which Agile import products were on offer at the window's start and end, and refuses unless there is exactly one (`AGILE-24-10-01`); joining two product codes would need a rule for which applies when. It follows the API's `next` links (12 pages of 1,500). Each half-hour is placed on the typical year by calendar date and time; 29 February is dropped. The build refuses a rate that isn't one half-hour long, a half-hour given twice and a typical-year half-hour with no rate. Both the rates with and without VAT are kept; the window carried 5% VAT until its last hour. The engine averages each UTC hour's two half-hours. The snapshot has 497 negative half-hours, which pass through.
- **Cosy:** the rates by UK local hour on the latest fully covered day without a clock change (21 October 2026, the rates in force since that day), and the standing charge in force then. Cosy's periods start on the hour, so both half-hours of each local hour must match.
- **Export:** Outgoing Octopus's current and previous rate, and the fixed Smart Export Guarantee tariff's rate.
- **Agile's standing charge** is today's: the API lists one charge in force since 1 October 2024.
- **Provenance:** every request URL in order, the fetch date, and the SHA-256 of the response bodies joined in that order. A test rebuilds the committed snapshot from responses made out of it, byte for byte.

## The PVGIS snapshot

`npm run fetch:pvgis` fetches the PVGIS v5.3 typical meteorological year for 51.507, −0.128 as JSON. It validates the response, then writes `data/snapshots/pvgis-tmy-london.json`. Run it only when the snapshot should change, because it needs network access. Commit the result.

- **Columns:** `T2m` (air temperature, °C), `G(h)` (global horizontal), `Gb(n)` (beam normal) and `Gd(h)` (diffuse horizontal), all in W/m², plus `time(UTC)`. Each is stored as one array of 8,760 values.
- **Timestamps** are UTC, as PVGIS gives them, for example `20160101:0000`. Each month comes from a different source year (listed in `monthsSelected`). Validation therefore checks that month, day and hour run 1 January 00:00 to 31 December 23:00 in order, rejects 29 February, and ignores the year.
- **Provenance:** the snapshot records the request URL, the fetch date, the SHA-256 of the raw response, the radiation database and the JRC attribution.
- **The snapshot fetched on 18 October 2026** uses PVGIS-SARAH3 radiation, and has an annual mean `T2m` of 11.12 °C.
