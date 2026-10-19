# The parameter register

**When to read this:** adding or changing a register row, reading parameters in the engine, refreshing a data snapshot, or checking where a number comes from.

Every number the engine uses comes from one file, [`data/register.json`](../data/register.json). Only physical constants and unit conversions live in code. Why it works this way is in the [typed parameter register ADR](./decisions/2026-10-17-typed-parameter-register.md). Why the data is snapshotted at build time is in the [client-side snapshots ADR](./decisions/2026-10-17-client-side-build-time-snapshots.md).

## Files

| File | What it does |
| --- | --- |
| `data/register.json` | The rows, in one `{ "rows": [...] }` object |
| `data/snapshots/pvgis-tmy-london.json` | The PVGIS typical year for London, referenced by a `series` row |
| `src/register/schema.ts` | Zod schemas for the row kinds, provenance and integrity rules |
| `src/register/load.ts` | `loadRegister(parsed)`: validates an already-parsed object, with no file reads; `staleRows(register, asOf)` |
| `src/register/ids.ts` | `ROW_IDS` and the `RowId` union |
| `src/register/access.ts` | `createAccessor(register)`: typed reads that throw on an unknown id, an unknown table key or the wrong kind |
| `src/snapshots/pvgisSchema.ts` | The snapshot schema and `loadPvgisSnapshot(parsed)` |
| `scripts/fetch-pvgis.ts`, `scripts/pvgis/trim.ts` | Fetch, trim and write the PVGIS snapshot |
| `scripts/calibration/meanInternalTemperature.ts`, `scripts/calibrate.ts` | The calibration of the mean internal temperature (`npm run calibrate`) |
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
| `series` | `file`, `schema`, `columns` | `schema` names a snapshot schema (`pvgis-tmy`) |
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
4. If you change a row the engine reads for the gas setup of the 1930s semi (weather, archetypes, geometry, fabric, gains, boiler or hot water), run the tests: the calibration test fails if the mean internal temperature no longer hits its target, and the row then needs re-solving with `npm run calibrate` (see below). Areas and volume are derived by the engine, so there are no geometry rows to keep in step.

## The rows

**Archetypes.** Ten house types, each keyed to one RdSAP age band (see the [phase 2 spec](../SPECIFICATIONS/02-complete-v1-model.md), "House types and geometry"). The 1930s semi is the phase 1 house: about 90 m², two storeys, 100 mm of loft insulation and double glazing installed before 2002. Its cavity walls are filled by default, because 73% of owner-occupied cavity-walled homes have cavity wall insulation (English Housing Survey 2024 to 2025). Phase 1 had them unfilled; the `asBuilt` answer gives that house.

| Section | Rows |
| --- | --- |
| weather | The PVGIS typical year (series); an outdoor-temperature offset (0 K, for tests); the minute past each hour that the irradiance values describe (10) |
| archetypes | By archetype: house type, age band, storeys, wall construction, default floor area (English Housing Survey 2012), bedrooms (NEED), aspect ratio, party walls and default quick-facts answers. By age band: room height, window area formula (RdSAP 2012 Table S4), ground floor construction and insulation (RdSAP 10 Table 19). Wall thickness by band and construction (Table 3); the upper-storey allowance (0.25 m); SAP's occupancy formula |
| geometry | The door area (1.85 m²) |
| fabric | U-values from RdSAP 10: walls by band, construction and wall answer (Table 6 and §5.7–5.8), party walls by construction (Table 15), windows by glazing answer (Table 24), doors by band (Table 26), roofs by loft answer (Table 16); the curtain resistance (SAP 10.2 §3.2); thermal bridging by band (Table 21); the ISO 13370 ground floor parameters (§5.12); the air change rate by band (approximate); the uncertain fabric quality factor (0.75–1.15) |
| gains | Internal gains per m² (fixed) and per occupant (uncertain, 75–140 W); their correlation with hot water per occupant (0.5); g⊥ by glazing answer (Table 24), SAP's 0.9 for non-normal incidence, the frame factor (0.7) and solar access factor (0.77); ground reflectance (0.2) |
| heating | Mean internal temperature (16.3 °C, calibrated, see below); boiler seasonal efficiency (0.80–0.89); boiler pump and fan electricity (86 kWh a year, SAP 10.2 Table 4f); heat pump SPF (Electrification of Heat SPFH4: lognormal, median 2.8, sigma 0.145, clipped to 2.0–4.0, including hot water) and the well-installed scenario's SPF (HeatpumpMonitor.org: median 3.9, sigma 0.14, clipped to 2.8–5.4); the COP curve's lift allowance (10 K), shape clamp (4–15) and ceiling (7); the compensation line's outdoor endpoints (−2 and 15 °C) and its flow temperatures (uncertain: 35–50 °C at design, 25–35 °C mild) |
| hotWater | Litres a day: 36 per household plus 25 per occupant (uncertain, 17–35); delivery and cold-feed temperatures; the hourly draw-off profile (Energy Saving Trust, 2008; local time, shares summing to 1); for the heat pump setups, the hot water flow temperature (50 °C), and the cylinder's volume (200 litres), setpoint (50 °C), reheat trigger (45 °C) and standing loss |
| prices | Ofgem price cap, GB average by Direct Debit, 1 October–31 December 2026, checked on 17 October 2026 |
| carbon | Natural gas factor (gross CV; to verify); grid electricity factor 0.14396 kgCO₂e/kWh (DESNZ 2026 set, electricity consumed, including transmission and distribution losses) |
| electricity | Base electricity use, from Ofgem's 2026 typical consumption values (1,600–3,800 kWh, mode 2,500) |

The `solar`, `costs` and `tariffs` sections exist in the schema and are filled by later phase 2 PRs.

**The RdSAP check (18 October 2026, [#9](https://github.com/mannepanne/energy-sim/issues/9)).** Every RdSAP-sourced row was checked line by line against the RdSAP 10 specification (9 June 2025) and marked sourced. What the check changed:
- **Party walls:** a cavity party wall is not zero. Table 15 gives 0.5 unfilled, 0.2 filled and 0.25 when the construction can't be determined, which the cavity archetypes use. Solid masonry is 0.
- **Thermal bridging:** RdSAP adds y × the exposed area (Table 21), which phase 1 left out.
- **g-values:** Table 24 gives g⊥ (0.76 for double glazing before 2002, not 0.63), and SAP's 0.9 for non-normal incidence applies on top.
- **Window U-values:** curtains are added (SAP 10.2 §3.2).
- **Window areas:** RdSAP 10 measures windows and has no default formula. Phase 1's 0.122 × floor area + 6.875 comes from RdSAP 2012 Table S4, which is the cited source.
- **Loft insulation:** Table 18 assumes 100 mm for bands A–G when the thickness is unknown. Phase 1 had called "no insulation" RdSAP's default for the band.
- **The ground floor:** the U-value is computed by ISO 13370 ([#7](https://github.com/mannepanne/energy-sim/issues/7)). Table 19 gives band C a solid floor, so the 1930s semi's floor is solid at 0.66 W/m²K, not suspended timber at 0.75.

**The heat pump rows (19 October 2026).** The SPF rows and the draw-off profile are sourced. The COP curve, the flow temperatures and the cylinder rows are approximate, the flow temperatures checked against the Electrification of Heat trial and HeatpumpMonitor.org: each gives its reason in its rationale, and the ordering a test enforces (hot water flow above the design flow's high, setpoint above the reheat trigger above the cold feed). On the price cap the curve rows change when the heat pump uses electricity, not how much, because k scales the year to the sampled SPF. `heating.heatPumpSpfWellInstalled` is read only in the well-installed scenario, so it is not among the default draws or in the phase 1 report's sensitivity table. See [engine.md](./engine.md#the-heat-pump-over-the-year).

**Correlations** cover uncertain rows only, not table cells, though cells have draw keys. Every house must read both rows of a correlation, or sampling throws; the one correlation names two rows every house reads.

The rows still `to-verify` are the fabric quality factor and the gas carbon factor ([#8](https://github.com/mannepanne/energy-sim/issues/8)). The heat pump SPF has been sourced since 19 October 2026, when the trial's interim report confirmed its boundary is H4.

## Overrides

Rows marked `overridable` are the ones a visitor will be able to replace with their own figure in phase 3. Floor area is an input to the engine, which derives every area and the volume from it, so a visitor's floor area flows through. User overrides of other fixed rows and cells still need their own path into the engine; that is a phase 3 decision (see [SPECIFICATIONS/CLAUDE.md](../SPECIFICATIONS/CLAUDE.md)).

## The mean internal temperature calibration

The benchmark found that the method agrees with HEM, but that both models predict more gas than comparable homes use. The [calibration ADR](./decisions/2026-10-17-air-temperature-calibrated-to-need.md) therefore calibrates `heating.meanInternalTemperature` to measured gas use.

- **What the row means:** a whole-house **air** temperature under continuous heating. It applies to both setups ("the same household, different kit") and to every archetype. It may absorb fabric error as well as heating behaviour. The row's rationale states all three points, and cites NEED as its source.
- **The target:** the 1930s semi's central annual gas use is 13,200 kWh. That is space heat plus hot water, divided by the boiler efficiency, with no cylinder loss for the combi. 13,200 kWh is the midpoint of NEED's readings A and C. The result must stay within those readings, 10,980–15,433 kWh. The target was fixed before the engine existed.
- **The method:** solve for the temperature at which the hourly engine's central gas use for the 1930s semi equals the target, on the PVGIS year, with its derived geometry and every other row at its default. `npm run calibrate` prints the solved values; they are copied into the row by hand, rounded to 0.1 °C.
- **The value: 16.3 °C** (solved 16.26 °C on 18 October 2026), giving 13,277 kWh of central gas use. The low and high (15.0 and 17.4 °C) are the temperatures that reproduce readings A and C by the same method. They describe uncertainty about the typical home, not the spread between households.
- **The drift check:** `scripts/calibration/meanInternalTemperature.test.ts` re-solves the temperature on the real register and snapshot. It fails if the row's default, low or high is more than 0.1 °C from the solved value, or if central gas use is more than 150 kWh from the target. So a change to any row the gas setup reads, including the window and weather rows, is caught once it moves the result by more than that.
- **History:**
  - The register PR set a provisional 16.0 °C (14.8–17.1) with the benchmark's rough monthly method. The hourly re-solve replaced it with 15.7 °C (14.5–16.8), and the rough-method solver was removed.
  - The phase 2 archetypes PR re-solved it on the continuous engine with derived geometry and the checked RdSAP fabric. With the cavity as built, the heat loss coefficient rose from 302 to 341 W/K (thermal bridging adds 29 W/K, the cavity party wall 9 W/K) and the solve gave 14.6 °C. Magnus then made a filled cavity the default for bands C–G (18 October 2026), which brings H to 274 W/K and the solve to 16.3 °C (15.0–17.4). Without thermal bridging it would be 17.2 °C.
  - The heating schedules PR replaces this row with a calibrated setpoint.

## The PVGIS snapshot

`npm run fetch:pvgis` fetches the PVGIS v5.3 typical meteorological year for 51.507, −0.128 as JSON. It validates the response, then writes `data/snapshots/pvgis-tmy-london.json`. Run it only when the snapshot should change, because it needs network access. Commit the result.

- **Columns:** `T2m` (air temperature, °C), `G(h)` (global horizontal), `Gb(n)` (beam normal) and `Gd(h)` (diffuse horizontal), all in W/m², plus `time(UTC)`. Each is stored as one array of 8,760 values.
- **Timestamps** are UTC, as PVGIS gives them, for example `20160101:0000`. Each month comes from a different source year (listed in `monthsSelected`). Validation therefore checks that month, day and hour run 1 January 00:00 to 31 December 23:00 in order, rejects 29 February, and ignores the year.
- **Provenance:** the snapshot records the request URL, the fetch date, the SHA-256 of the raw response, the radiation database and the JRC attribution.
- **The snapshot fetched on 18 October 2026** uses PVGIS-SARAH3 radiation, and has an annual mean `T2m` of 11.12 °C.
