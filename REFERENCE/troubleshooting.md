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
- a `dependsOn` id that doesn't exist, or a dependency cycle.

**The id parity test fails.** A row was added to or removed from the register without the same change to the `RowId` union in `src/register/ids.ts`, or the other way round. Keep the two in step.

**The calibration test fails** (`scripts/calibration/meanInternalTemperature.test.ts`). A change to a row the gas setup reads, such as a U-value, the windows or the weather, has moved central gas use away from its calibration target. Re-solve the `heating.meanInternalTemperature` row with `npm run calibrate`, as [register.md](./register.md#the-mean-internal-temperature-calibration) describes, then regenerate the report.

## The report and CI

**CI's "Report drift" step fails.** The committed report no longer matches what the register and snapshot produce, or a file in `reports/` was never committed. Run `npm run report` and commit the result. Any change to a register row, the snapshot or the engine can change the report, so regenerate it in the same PR.

**`npm run report` gives a different file on a second run.** That breaks the drift check. The report must never read the clock or depend on run order. Look for a date, a timestamp or an unseeded random number in `scripts/report/`.

**CI's "Bench" step fails.** 500 samples × 2 setups took longer than 5 seconds. On a recent Mac it takes about 0.6 seconds (580–590 ms on 18 October 2026), and CI runners are somewhat slower, so a failure means a real slowdown, not noise. Look for a slowdown in the hourly loop: per-hour objects instead of typed arrays, or weather prepared again for every sample instead of once.

## The benchmark

**A benchmark README test fails** ("Run `npm run benchmark:rough` …", "`benchmark:tables` …"). A draft value changed, so the tables in `scripts/benchmark/README.md` are out of date. Run the command named in the failure and paste its output over the old tables.

**The HEM input drift test fails** ("Run `npm run benchmark:hem-input`, rerun HEM …"). The committed HEM input files no longer match the draft values. Regenerate them, rerun HEM as [hem/README.md](../scripts/benchmark/hem/README.md#how-to-reproduce-the-run) describes, record the new results in `HEM_RESULTS` in `scripts/benchmark/comparison.ts`, then run `npm run benchmark:tables` and update the README.

## Refreshing data

**Refreshing the PVGIS weather.** Run `npm run fetch:pvgis` (it needs network access), then commit `data/snapshots/pvgis-tmy-london.json`. A new snapshot changes solar gains and heat demand, so rerun `npm run calibrate`, update the temperature row if the calibration test fails, and regenerate the report.

**Updating prices at a new price cap period.** Update the price rows, their `lastChecked` and `validUntil` dates, and their source, then regenerate the report. The report's "Rows due for a fresh check" table shows which rows are due.
