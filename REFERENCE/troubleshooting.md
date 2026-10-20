# Troubleshooting

**When to read this:** a check fails locally or in CI, the register won't load, or a data file needs refreshing.

**Related documents:**
- [CLAUDE.md](../CLAUDE.md): the project navigation index
- [environment-setup.md](./environment-setup.md): Node, dependencies and CI
- [testing-strategy.md](./testing-strategy.md): what each check covers
- [register.md](./register.md) and [engine.md](./engine.md): how the register and the engine work

Add an entry here when a problem takes more than a few minutes to work out.

---

## Set-up

**`npm ci` fails, or tests won't start with "Cannot find package 'vitest'".** The dependencies aren't installed, or `package-lock.json` doesn't match `package.json`. Use the Node version in `.nvmrc` (`nvm use` picks it up), then run `npm ci`. Don't run a bare `npm install` to "fix" the lockfile; add or bump packages only as the 14-day rule in root `CLAUDE.md` describes.

**Type errors appear only in CI.** Run `npm run typecheck` locally. TypeScript is pinned to an exact version and upgraded together with `oxlint-tsgolint`, so a version mismatch between the two shows up as lint or type errors ([TypeScript 7 and Oxlint ADR](./decisions/2026-10-17-typescript-7-with-oxlint.md)).

**Lint rejects a type assertion (`no-unsafe-type-assertion`).** The type-aware lint rules don't allow `as` casts that narrow a type. Give the value a proper type, or narrow it with a check, instead.

## The register

**`RegisterValidationError` when loading `data/register.json`.** The error lists every problem, each naming the row id, its position and the field, for example `Row "heating.heatPumpSpf" (rows[n]), field "default": …`. Fix each named field. The full list of integrity rules is in [register.md](./register.md#integrity-rules). Common causes:
- a field misspelt (unknown fields are rejected);
- an uncertain row whose default lies outside low–high, or a lognormal row whose default differs from its median;
- a `sourced` or `to-verify` row without a `source`, or an `approximate` row without a `rationale`;
- a `dependsOn` id that doesn't exist, or a dependency cycle;
- a table row with a duplicate key, or a key containing `|`;
- a correlation row whose two rows are missing from its `dependsOn`, or a row named by two correlations.

**The id parity test fails.** A row was added to or removed from the register without the same change to the `RowId` union in `src/register/ids.ts`, or the other way round. Keep the two in step.

**The table key parity test fails** (`src/engine/archetypes.test.ts`). The test checks every table against its `keyedBy` kind: a table keyed by archetype must hold exactly `ARCHETYPE_KEYS`, one keyed by age band exactly the bands the archetypes use, and so on for constructions and quick-facts answers. Add or remove the cells. A `keyedBy` outside `TABLE_KEY_KINDS` fails the register load instead, so no table can drop out of the check. A new archetype needs a cell in every archetype-keyed table, a pre-registered NEED reading in `scripts/archetypes/needReadings.ts`, and cells for its band if no other archetype uses it.

**"Register row … has no cell with key …".** The engine read a table key that isn't there, often a wall answer that doesn't fit the archetype's construction (such as `cavityFilled` on solid brick). Use `wallAnswers(access, archetype)` for the answers an archetype offers, or add the missing cell with its source.

**"The standby share (…) must be at least 0 and below 1 − SPF ÷ COP ceiling".** After standby, the heat must still be suppliable with every hour at the ceiling. A test keeps each scenario's highest standby share below 1 − its highest SPF ÷ `heating.copCeiling`; if this fires, a row's range has moved. Check the SPF rows' highs and the standby share rows' highs against the ceiling row.

**"The hot water draw-off profile must be non-negative shares summing to 1".** `hotWater.drawOffProfile` holds each local hour's share of the day's hot water. Rescale its 24 values so they sum to 1.

**"The compensation line's …" or "The COP shape clamp needs 0 < floor < ceiling".** The heat pump curve rows are out of order: the design outdoor temperature must be below the mild one, the design flow at or above the mild flow, and the shape floor below its ceiling.

**The COP curve tests on the real register fail** (`src/engine/heatPump.test.ts`).
- *The 0.1% SPF check:* the k solve no longer matches the year to the sampled SPF. Look for heat counted in the solve but not in the electricity (or the other way round), such as cylinder reheats left out of the load.
- *"The ceiling binds in a few samples":* a curve or SPF row change means the ceiling never binds in the 200 samples, so the iterative solve goes untested on real data. That is physically fine. If the change was intended, rely on the constructed-load tests for the iterative solve, drop the real-register assertion, and say so in the PR.
- *The flow ordering:* the hot water flow must stay at or above the high of `heating.flowTemperatureAtDesign`, and the cylinder's setpoint above its reheat trigger. Fix the rows, not the test.

**"The profile "electricity.baseProfileWeekly" must be non-negative …" or "A weekly profile needs 168 values".** A base electricity profile row is malformed. Rederive both rows with `npm run derive:base-profile` (see [register.md](./register.md#the-rows)) rather than editing values by hand.

**The PV check fails** (`scripts/pvgis/pvcalcCheck.test.ts`).
- *"no longer describe the pre-registered reference system":* a solar row's default (tilt, direction or system loss) changed, so the engine no longer models the system PVcalc was asked about. The check was pre-registered on those defaults. Changing one means a new pre-registration and a new PVcalc call, agreed first; don't edit the reference system to match.
- *The pinned gap (−2.55%) moved:* a change to the sun position, the transposition, the PV formulas or the weather moved the engine's yield. If the change is intended and the gap stays within 8%, re-pin it and update the table in [engine.md](./engine.md#checks-against-outside-references).
- *Outside 8%:* stop and look for the cause before touching any row; the tolerance was fixed before the check ran.

**"Setup "…" is not in this run" or "The reference setup "gas" is not in this run".** A caller asked `forSetup` or `compare` for a setup that `runSetups` was not given. Pass it in `setups`, or leave `setups` out to run all four.

**`setups.test.ts` fails on "… on gasSolar" (or another setup).** A row that `runningCostReads` says a setup does not read now moves that setup's running cost, so the sensitivity tables would drop a row that matters. Add the row to the right set in `src/engine/setups.ts` (heat pump, boiler, solar or capital), or remove it from the set it wrongly sits in.

**The payback examples fail** (`src/engine/payback.test.ts`). The tests reproduce the hand-worked examples in [engine.md](./engine.md#the-hand-worked-examples) exactly. If the payback rules changed on purpose (the horizon, when replacements land, the grant), rework the examples in engine.md by hand first, then update the tests to match. Don't change the expected years to whatever the code now gives.

**A payback summary shows "beyond lifetime" for the median, or a large share "cheaper up front, costs more to run".** At least half the ranked samples don't pay back within their horizon, or many samples cost less up front after the grant than the boiler but more to run. Both are results, not errors. Check the inputs that drive it: the installed cost rows, the running-cost difference, and the lifetimes.

**The calibration test fails** (`scripts/calibration/meanInternalTemperature.test.ts`). A change to a row the 1930s semi's gas setup reads, such as an archetype fact, a U-value, the windows or the weather, has moved central gas use away from its calibration target. Re-solve the `heating.meanInternalTemperature` row with `npm run calibrate`, as [register.md](./register.md#the-mean-internal-temperature-calibration) describes, then regenerate the report.

## The report and CI

**CI's "Report drift" step fails.** The committed report no longer matches what the register and snapshot produce, or a file in `reports/` was never committed. Run `npm run report` and commit the result. Any change to a register row, the snapshot or the engine can change the report, so regenerate it in the same PR.

**`npm run report` gives a different file on a second run.** That breaks the drift check. The report must never read the clock or depend on run order. Look for a date, a timestamp or an unseeded random number in `scripts/report/`.

**`npm run archetypes` shows an archetype newly flagged.** The flag rule and the NEED readings were fixed before any archetype ran ([scripts/archetypes/README.md](../scripts/archetypes/README.md)), so don't change them to clear a flag. A flag is an honest result. Check instead that the archetype's register rows are right, and record the gap as evidence on [#14](https://github.com/mannepanne/energy-sim/issues/14).

**CI's "Bench" step fails.** 500 samples took longer than 2.5 seconds per setup: 5 seconds for the two setups without solar, or 10 for all four. On a recent Mac they take about 1.5 and 3 seconds, and on the CI runner about 2.9 and 5.7 seconds (20 October 2026, with the heat pump curve, the cylinder, the hourly base profile and roof solar). So a failure means a real slowdown, not noise. Look for a slowdown in the hourly loop: per-hour objects instead of typed arrays, or weather prepared again for every sample instead of once.

## The benchmark

**A benchmark README test fails** ("Run `npm run benchmark:rough` …", "`benchmark:tables` …"). A draft value changed, so the tables in `scripts/benchmark/README.md` are out of date. Run the command named in the failure and paste its output over the old tables.

**The HEM check in `src/engine/simulate.test.ts` fails on its pinned 12,999 kWh.** A change to the solar gains, the heat loss formula or the weather moved the engine's answer for the benchmark house. If the change is intended and the result stays within 10% of HEM's 13,660 kWh, re-pin the number and update [engine.md](./engine.md#checks-against-outside-references). The check feeds the engine HEM's own element areas, so derived geometry does not enter it.

**The HEM input drift test fails** ("Run `npm run benchmark:hem-input`, rerun HEM …"). The committed HEM input files no longer match the draft values. Regenerate them, rerun HEM as [hem/README.md](../scripts/benchmark/hem/README.md#how-to-reproduce-the-run) describes, record the new results in `HEM_RESULTS` in `scripts/benchmark/comparison.ts`, then run `npm run benchmark:tables` and update the README.

## Refreshing data

**Refreshing the PVGIS weather.** Run `npm run fetch:pvgis` (it needs network access), then commit `data/snapshots/pvgis-tmy-london.json`. A new snapshot changes solar gains and heat demand, so rerun `npm run calibrate`, update the temperature row if the calibration test fails, and regenerate the report.

**Refreshing the PVcalc figure.** Run `npm run fetch:pvcalc` (network), commit `data/snapshots/pvgis-pvcalc-london.json`, and rerun the PV check; re-pin its gap if PVGIS's figure moved.

**Refreshing the base electricity profile.** Download Elexon's average profiling data from its profiling page (ask first; it is not committed), unzip it, run `npm run derive:base-profile -- <folder>`, and paste the two printed arrays into the profile rows. A newer file may have another layout; the reader throws naming the cell it did not expect.

**Refreshing costs, the grant and the export rate.**
- *The heat pump cost* (`costs.heatPumpInstalled`, quarterly): download the latest Boiler Upgrade Scheme statistics from GOV.UK (ask first), read table Q1.1A's latest quarter for air-to-water heat pumps, and update the median and the rationale's quartiles. Keep the file in `REFERENCE/data-downloads/`.
- *PV per kWp* (yearly): DESNZ publishes solar PV cost data each financial year. Read the summary table's 0–4 kW median, then scale it by the domestic 0–4 kW mean ÷ the all-installs 0–4 kW mean (domestic costs table and summary table). The median includes cheaper non-domestic installs, so entering it unscaled flatters solar. Record both figures and the ratio in the rationale.
- *The grant* (monthly): check GOV.UK's "Apply for the Boiler Upgrade Scheme" pages for the amount and the conditions, and update the row's rationale and `lastChecked`.
- *The export rate* (quarterly): query the Octopus API for London (region C) unit rates of Outgoing Octopus (the mode) and of the fixed Smart Export Guarantee tariff (the low end). The high end is Outgoing Octopus's highest recent rate. The tariffs PR snapshots them.

Each change moves payback, and the price rows also move running cost, so regenerate the report.

**Updating prices at a new price cap period.** Update the price rows, their `lastChecked` and `validUntil` dates, and their source, then regenerate the report. The report's "Rows due for a fresh check" table shows which rows are due.
