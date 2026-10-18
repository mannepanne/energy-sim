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
| `src/register/access.ts` | `createAccessor(register)`: typed reads that throw on an unknown id or the wrong kind |
| `src/snapshots/pvgisSchema.ts` | The snapshot schema and `loadPvgisSnapshot(parsed)` |
| `scripts/fetch-pvgis.ts`, `scripts/pvgis/trim.ts` | Fetch, trim and write the PVGIS snapshot |
| `scripts/benchmark/calibration.ts` | The provisional calibration of the mean internal temperature |

## Reading the register

```typescript
import { createAccessor } from './register/access.ts';
import { loadRegister } from './register/load.ts';

const access = createAccessor(loadRegister(parsedJson)); // the caller reads and parses the file
const floorArea = access.fixed('geometry.totalFloorArea').value;
const spf = access.uncertain('heating.heatPumpSpf'); // default, low, high, distribution, median, sigma
```

The accessor takes a `RowId`, so a misspelt id fails type checking. At run time it throws an error naming the id if the row is missing, and it throws if the row is a different kind from the one asked for.

## Row fields

Every row has `id`, `kind`, `section`, `label`, `unit`, `status`, `lastChecked` (YYYY-MM-DD), `refreshCadence` (`quarterly`, `yearly`, `static` or a whole number of months), `overridable`, `overrideHint` (text, or `null`) and `dependsOn` (row ids).

**Provenance depends on the status:**
- `sourced` (checked against the source on `lastChecked`) and `to-verify` (taken from the source, not yet checked line by line) need `source: { title, url }`.
- `approximate` (an estimate) needs a `rationale`, and may add a `source`.

Any row may carry a `rationale`, and most do.

**Value fields depend on the kind:**

| Kind | Fields | Notes |
| --- | --- | --- |
| `uncertain` | `default`, `low`, `high`, `distribution` | `triangular`: `default` is the mode. `lognormal`: also `median` and `sigma`; `default` equals `median`, and draws are clipped to `low`–`high`. |
| `fixed` | `value` | |
| `series` | `file`, `schema`, `columns` | `schema` names a snapshot schema (`pvgis-tmy`) |
| `profile` | `values`, `resolution` | `hour-of-day` needs 24 values, `month` needs 12 |

Unknown fields are rejected, so a typo such as `defualt` fails.

## Integrity rules

`loadRegister` throws a `RegisterValidationError`. Its `problems` list names each row by id and position, and names the field, for example `Row "heating.heatPumpSpf" (rows[26]), field "default": (3) must equal median (2.8) for a lognormal row`. It fails when:
- a field required by the row's kind or status is missing, or has the wrong type;
- an uncertain row's default lies outside low–high, or low is above high;
- a lognormal row lacks `median` or `sigma`, its default differs from its median, or its sigma is not positive; a triangular row carries either field;
- a profile has the wrong number of values;
- two rows share an id;
- a `dependsOn` entry names a missing row, or the dependencies form a cycle;
- `lastChecked` is not a real calendar date (2026-02-30 fails).

Cross-row rules (duplicates, dependencies) run only once every row is valid on its own.

**Stale rows are a warning, not an error.** `staleRows(register, asOf)` lists rows whose `lastChecked` plus their cadence falls before `asOf`. The caller passes the date, so output never depends on the clock and the committed report stays byte-identical.

## Adding or changing a row

1. Add the row to `data/register.json`, with a source or a rationale, and set `lastChecked` to the day you checked it.
2. Add its id to `ROW_IDS` in `src/register/ids.ts`. The parity test fails until the two match.
3. Fill in `dependsOn` with the rows its value was derived from.
4. If you change a geometry, fabric, gains, boiler or hot water row, run the tests: the calibration test fails if the mean internal temperature no longer hits its target, and the row then needs re-solving (see below).

## The phase 1 rows

The rows describe one archetype: a 1930–49 semi in London, about 90 m², two storeys, unfilled cavity walls, 100 mm of loft insulation and retrofitted double glazing. The values match the benchmark's draft values (`scripts/benchmark/draftValues.ts`), so the benchmark and the register describe the same house.

| Section | Rows |
| --- | --- |
| weather | The PVGIS typical year (series); an outdoor-temperature offset (0 K, for tests) |
| geometry | Floor area, storey height, heated volume, exposed perimeter, window, door, wall, roof and ground floor areas |
| fabric | U-values for walls, party wall (0), windows, door, roof (main case and no-insulation variant) and ground floor; air change rate; the uncertain fabric quality factor (0.75–1.15) |
| gains | Internal gains (uncertain, 350–550 W); window g-value, frame factor and solar access factor |
| heating | Mean internal temperature (calibrated, see below); boiler seasonal efficiency (0.80–0.89); heat pump SPF (lognormal, median 2.8, sigma 0.145, clipped to 2.0–4.0, including hot water) |
| hotWater | Litres a day (uncertain, 70–140); delivery and cold-feed temperatures; cylinder standing loss (heat pump setup only) |
| prices | Ofgem price cap, GB average by Direct Debit, 1 October–31 December 2026, checked on 17 October 2026 |
| carbon | Natural gas factor (gross CV; to verify); grid electricity factor 0.14396 kgCO₂e/kWh (DESNZ 2026 set, electricity consumed, including transmission and distribution losses) |
| electricity | Base electricity use, from Ofgem's 2026 typical consumption values (1,600–3,800 kWh, mode 2,500) |

Rows still marked `to-verify` mostly cite the RdSAP 10 specification and need a line-by-line check. The ground floor U-value (0.75) is approximate: the BS EN ISO 13370 working RdSAP specifies is still to be done and recorded in the row.

## The mean internal temperature calibration

The benchmark found that the method agrees with HEM, but that both models predict more gas than comparable homes use. The [calibration ADR](./decisions/2026-10-17-air-temperature-calibrated-to-need.md) therefore calibrates `heating.meanInternalTemperature` to measured gas use.

- **What the row means:** a whole-house **air** temperature under continuous heating. It applies to both setups ("the same household, different kit"). It may absorb fabric error as well as heating behaviour. The row's rationale states all three points, and cites NEED as its source.
- **The target:** the archetype's central annual gas use is 13,200 kWh. That is space heat plus hot water, divided by the boiler efficiency, with no cylinder loss for the combi. 13,200 kWh is the midpoint of NEED's readings A and C. The result must stay within those readings, 10,980–15,433 kWh. The target was fixed before the engine existed.
- **The method:** solve for the temperature at which gas use equals the target, using every other row at its default.
- **Provisional value: 16.0 °C.** `scripts/benchmark/calibration.ts` solves it with the benchmark's rough monthly method on the register's own rows. It uses Heathrow's 1991–2020 degree days and a constant 250 W of solar gains. The low and high (14.8 and 17.1 °C) are the temperatures that reproduce readings A and C by the same method. They describe uncertainty about the typical home, not the spread between households.
- **Final value:** the engine PR re-solves the temperature with the hourly engine on the PVGIS year, and replaces the provisional values. `calibration.test.ts` checks that the provisional value still matches the register, so drift in the boiler or hot water rows is caught.

## The PVGIS snapshot

`npm run fetch:pvgis` fetches the PVGIS v5.3 typical meteorological year for 51.507, −0.128 as JSON. It validates the response, then writes `data/snapshots/pvgis-tmy-london.json`. Run it only when the snapshot should change, because it needs network access. Commit the result.

- **Columns:** `T2m` (air temperature, °C), `G(h)` (global horizontal), `Gb(n)` (beam normal) and `Gd(h)` (diffuse horizontal), all in W/m², plus `time(UTC)`. Each is stored as one array of 8,760 values.
- **Timestamps** are UTC, as PVGIS gives them, for example `20160101:0000`. Each month comes from a different source year (listed in `monthsSelected`). Validation therefore checks that month, day and hour run 1 January 00:00 to 31 December 23:00 in order, rejects 29 February, and ignores the year.
- **Provenance:** the snapshot records the request URL, the fetch date, the SHA-256 of the raw response, the radiation database and the JRC attribution.
- **The snapshot fetched on 18 October 2026** uses PVGIS-SARAH3 radiation, and has an annual mean `T2m` of 11.12 °C.
