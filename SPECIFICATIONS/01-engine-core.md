# Phase 1: engine core

## Phase overview

**Phase number:** 1
**Phase name:** Engine core (headless)
**Estimated timeframe:** 2–3 weeks of side-project time
**Dependencies:** None. This is the starting phase.

**Brief description:**
Build the parameter register and the hourly simulation engine as a plain TypeScript library with no user interface. It covers one house archetype in one location and compares a gas boiler with an air source heat pump on the price-cap tariff. Results come out as ranges. The phase exists to test the project's riskiest assumption first: that a simple, fast hourly engine can give numbers we trust. It ends with a report Magnus can read and check without running any code.

Background: [project-outline.md](./ORIGINAL_IDEA/project-outline.md) (scope and goals) and [home-energy-simulator-spec.md](./ORIGINAL_IDEA/home-energy-simulator-spec.md) (model and register detail).

---

## Scope and deliverables

### In scope
- [ ] Repository tooling: TypeScript (strict), Vitest with coverage, linting, and a GitHub Actions workflow that runs type checking and tests on every PR.
- [ ] The register schema, plus a single register data file validated against it when loaded.
- [ ] Register rows for everything phase 1 uses (see "Register contents" below). Each row has a source and status.
- [ ] Build-time data snapshots: a PVGIS typical meteorological year for London, committed to the repo and referenced from the register.
- [ ] The hourly engine: heat loss, space heat demand, hot water demand, heat supply (gas boiler or heat pump), electricity balance, cost and carbon. It covers 8,760 hours for one house and one setup.
- [ ] Uncertainty bands, using paired, seeded sampling (see "Architecture decisions").
- [ ] Paired comparison of two setups: the difference with its range, and the share of samples in which each setup wins.
- [ ] A benchmark check of the engine's physics, time-boxed (see "Benchmark spike").
- [ ] A generated report, `reports/phase-1-london-semi.md`, comparing gas and heat pump for the archetype in plain language.
- [ ] Tests for all of the above, and `REFERENCE/` docs for the engine and register.

### Out of scope
- Any user interface or website. That is phase 3.
- Archetypes beyond the one below, and the quick-facts inputs. Those are phase 2.
- Solar PV, time-of-use tariffs, capital costs, grants and payback. Those are phase 2.
- An hourly grid-carbon profile. Phase 1 uses an annual average factor, which is enough on a flat tariff.
- Bill calibration, batteries, EVs and upgrade options. These come later (see the outline).

### Acceptance criteria
- [ ] Running `npm run report` regenerates the report from the register and snapshots alone, with no network access.
- [ ] The report shows the annual heat demand, the kWh by fuel, the running cost and the carbon for both setups. Each is shown as a central value with a low–high range, plus the paired difference and the share of samples in which the heat pump is cheaper.
- [ ] Every number the engine uses comes from a register row. A test fails if the engine reads a parameter that has no row.
- [ ] The register file fails validation, with a clear message, if any row lacks a source, a range, a unit or a last-checked date.
- [ ] The physics checks pass (see "Testing strategy").
- [ ] The benchmark check has a recorded result, either against HEM or against the fallback, with the gap stated in the report.
- [ ] Magnus has read the report and agrees the results are plausible for a 1930s semi in London.
- [ ] All tests pass with coverage of 95%+ for lines, functions and statements and 90%+ for branches. Type checking passes, and CI is green.

---

## Technical approach

### Architecture decisions

**The engine is a pure library, independent of any framework**
- Choice: a dependency-light TypeScript module with no I/O. Inputs are the register and the snapshots, and outputs are plain objects.
- Rationale: it runs unchanged in tests, in the report script and in the phase 3 browser app. Keeping it separate from the UI is also what lets the 3D street read results without being able to change them.
- Alternatives considered: building the engine inside a web app from the start. That was rejected because it ties the riskiest part to a framework choice we don't need to make yet.

**Data snapshots are taken at build time, and the app is fully client-side**
- Choice: scripts fetch the external data (PVGIS now, Octopus and NESO in phase 2) and commit it as versioned JSON. The engine never calls an external API.
- Rationale: PVGIS [does not allow browser (AJAX) calls](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en), so it can't be fetched live from the site anyway. Snapshots also make runs reproducible and testable, and they let the finished site run entirely in the visitor's browser with no server that holds personal data.
- Consequence for later: covering all of England means either a pre-built set of snapshots (for example, one per postcode district) or a small caching proxy. That is decided when we leave the single location.
- ADR: this is the privacy decision the outline flagged, and it gets an ADR.

**The register is one validated data file**
- Choice: `data/register.json`, with every row validated against a schema (Zod) when loaded. Large time series (hourly weather) live in separate snapshot files, and the register row for each carries its source, unit and last-checked date.
- Rationale: one source of truth, as agreed. The schema enforces the trust rules, so a row can't exist without a source.
- Row fields: `id`, `section`, `label`, `unit`, `default`, `low`, `high`, `distribution`, `source` (title and URL), `status` (`sourced`, `to-verify` or `approximate`), `lastChecked`, `refreshCadence`, `overridable`, `overrideHint`, `dependsOn`.
- ADR: the register format gets an ADR.

**Uncertainty bands come from paired, seeded sampling**
- Choice: the engine draws N joint samples (default 500). Each sample takes every uncertain parameter from its register distribution, which is triangular on low, default and high unless the row says otherwise. Each sample runs the full year. The central result is the run with every parameter at its default. The band is the 10th–90th percentile of the samples.
- Why not "all lows, all highs": that gives incoherent extremes. A low SPF is bad for a heat pump, but a low U-value is good for it, so there is no single "low" world.
- **Comparisons are paired.** Both setups run on the same samples, and the engine reports the distribution of the per-sample difference (A minus B) and the share of samples in which A beats B. Shared uncertainties (fabric, weather, behaviour, price level) then cancel instead of making two overlapping bands look like a coin toss. This is what makes the tool "right on the decisions".
- The generator is seeded, so results are deterministic and testable.
- Known simplification: parameters are sampled independently. Correlations (for example, gas and electricity prices moving together) are a later refinement and are listed as technical debt.
- Performance check: 500 samples × 8,760 hours × 2 setups is about 9 million simple steps. That should take well under a second in Node. A test asserts a time budget, so a slow engine is noticed before phase 3 puts it in a browser.

### Register contents for phase 1

These rows are taken from the spec's registers and filled with real values:

- **Location and weather (register 1):** a London typical year from PVGIS v5.3 (`tmy`), and the regional design temperature.
- **Fabric (register 2), one archetype: a 1930s semi-detached house of about 90 m².** Wall, roof, floor, window and door U-values from the RdSAP 10 England tables for its age band. Air changes per hour, thermostat setpoint, heating schedule, occupants, hot water use and base electricity. Solid-wall U-values carry wide ranges, per the spec's note on known bias.
- **Heating (register 3):** ASHP SPF (2.8, range 2.3–4.0), the COP-versus-outdoor-temperature curve, flow temperature, gas boiler seasonal efficiency, and the heat pump's hot water efficiency.
- **Prices and carbon (register 6):** price-cap unit rates and standing charges for October–December 2026 (verified against Ofgem on 2026-10-17), the gas carbon factor, and an annual average grid carbon factor from DESNZ.

**Modelling rule to make explicit:** a heat-pump-only house has no gas supply, so it pays no gas standing charge (29.68p a day, about £108 a year). This matters a lot. On today's price cap, heat from a heat pump at SPF 2.8 costs 26.32 ÷ 2.8 ≈ 9.4p per kWh, and heat from an 85% boiler costs 7.97 ÷ 0.85 ≈ 9.4p per kWh. Running costs are nearly level, so the standing charge and the SPF decide the result. The report should show this plainly.

### Benchmark spike (time-boxed)

The outline assumes the engine can get within about ±15% of HEM on annual space heating. This phase tests that assumption without letting it stall the work.

1. **Spike, at most two days:** get DESNZ's open-source Home Energy Model running locally with an input that represents our archetype, and record its annual space heat demand.
2. **If HEM can't be run in that time**, use the fallback. Compare our heat loss coefficient with the MCS heat loss calculator's figure for an equivalent house. Then check that our annual gas use for the archetype lands near Ofgem's typical domestic consumption value (check the current figure before use).
3. Either way, record the result and the gap in the report and in `REFERENCE/engine.md`. A gap over 15% does not fail the phase on its own, but it must be explained, and it becomes a decision for Magnus before phase 2.

The heat pump COP curve has a similar dependency. The spec plans to fit it to Electrification of Heat trial data from the UK Data Service. If that data needs registration or an approval we can't get quickly, the fallback is a standard ASHP COP curve shape, scaled so that it reproduces the trial's published median SPF of 2.8 over the typical year. The register row records which approach was used.

### Technology choices

- **Language:** TypeScript in strict mode, on the current Node LTS.
- **Tests:** Vitest with V8 coverage.
- **Schema validation:** Zod.
- **Scripts:** TypeScript scripts run with `tsx` for snapshot fetching and report generation.
- **CI:** a GitHub Actions workflow for type checking, lint, tests and coverage thresholds.
- **Versions:** check the current stable release of each tool when setting up. Don't copy versions from memory.

The web framework and hosting for phase 3 are not chosen in this phase.

### Key files and components

**New files to create:**
```
data/
  ├── register.json                 # every parameter, one row each
  └── snapshots/
      └── pvgis-tmy-london.json     # hourly typical year
src/
  ├── register/
  │   ├── schema.ts                 # Zod schema for register rows
  │   ├── load.ts                   # load and validate the register
  │   └── *.test.ts
  ├── engine/
  │   ├── fabric.ts                 # heat loss coefficient
  │   ├── demand.ts                 # space heat and hot water, hourly
  │   ├── supply.ts                 # boiler and heat pump
  │   ├── balance.ts                # electricity and gas per hour
  │   ├── costCarbon.ts             # tariffs and carbon
  │   ├── simulate.ts               # one house, one setup, one year
  │   ├── sampling.ts               # seeded joint sampling
  │   ├── compare.ts                # paired comparison
  │   └── *.test.ts
  └── types.ts
scripts/
  ├── fetch-pvgis.ts                # writes the snapshot
  └── report.ts                     # writes the phase 1 report
reports/
  └── phase-1-london-semi.md        # generated
.github/workflows/ci.yml
REFERENCE/
  ├── engine.md                     # how the engine works
  └── register.md                   # how the register works and how to add a row
```

**Files to modify:**
- Root `CLAUDE.md`: the stack, commands and current phase.
- `REFERENCE/CLAUDE.md`: links to the two new reference docs.
- `README.md`: replace the template text with a short project description.

---

## Testing strategy

### Unit tests

**Coverage targets:** lines, functions and statements 95%+; branches 90%+. The fetch scripts call external APIs, so they are tested against recorded fixtures rather than live endpoints.

**Physics checks** (tests that the model behaves like a house):
- A year has exactly 8,760 hourly steps, and annual totals equal the sum of the hours.
- Heat delivered equals heat demanded in every hour, so no heat is lost or invented.
- Heat demand is zero when the outdoor temperature is at or above the setpoint after gains.
- Lower U-values or fewer air changes always lower the annual heat demand.
- A colder year always raises it.
- A higher SPF always lowers the heat pump's electricity use and cost.
- Gas use for a given heat demand scales exactly with 1 ÷ boiler efficiency.
- The heat-pump-only setup pays no gas standing charge.
- The hand-calculated example from the price-cap note above is reproduced to within rounding.

**Register checks:**
- The real register file validates.
- A row missing a source, unit, range or date fails with a message naming the row and the field.
- A default outside its own low–high range fails validation.
- The engine reading a parameter id that has no row throws an error naming the id.

**Sampling and comparison checks:**
- The same seed gives identical results, and a different seed gives different samples.
- The central run uses only default values.
- With every range collapsed to its default, the band collapses to the central value.
- Paired comparison: when two setups are identical, the difference is zero in every sample.
- The share-of-wins figure is between 0 and 1 and moves in the expected direction when one setup is made strictly better.
- The full run (500 samples, 2 setups) stays within a time budget.

### Integration tests
- [ ] The end-to-end path from register and snapshot to a finished report runs offline and produces the same output twice for the same seed.
- [ ] A snapshot file whose contents don't match its expected shape fails with a clear message.

### Manual testing checklist
- [ ] Magnus reads `reports/phase-1-london-semi.md` and the numbers look plausible.
- [ ] The report states the benchmark result and its gap in plain language.
- [ ] Changing one register value (for example, SPF to 3.5) and rerunning the report changes the result in the expected direction.

---

## Pre-commit checklist

- [ ] All tests pass (`npm test`).
- [ ] Type checking passes (`npm run typecheck`).
- [ ] Coverage meets targets (`npm run test:coverage`).
- [ ] The report regenerates without network access (`npm run report`).
- [ ] Documentation is updated: `REFERENCE/engine.md`, `REFERENCE/register.md`, the indexes and root `CLAUDE.md`.
- [ ] There is no debug output, and no secrets. Phase 1 needs no API keys, because PVGIS is open.

---

## PR workflow

### Branch naming
`feature/phase-1-<part>`. Phase 1 is likely to land as a few PRs rather than one:
1. `feature/phase-1-tooling`: the repo set-up and CI.
2. `feature/phase-1-register`: the schema, the loader, the phase 1 rows and the PVGIS snapshot.
3. `feature/phase-1-engine`: the hourly engine and physics tests.
4. `feature/phase-1-ranges-report`: sampling, comparison, the benchmark result and the report.

### Review requirements
- Run `/review-spec` on this file before any implementation starts.
- Run `/review-pr` on each PR. The tooling PR touches CI and dependencies, so triage will route it to the team tier. That's expected.

### Deployment
None. Nothing is deployed in phase 1.

---

## Edge cases and considerations

### Known risks
- **HEM may be hard to run.** This is mitigated by the time-boxed spike and the named fallback.
- **The EoH trial data may need registration.** This is mitigated by the scaled generic COP curve.
- **The simple engine may differ a lot from HEM.** If so, it is reported honestly. Before phase 2, Magnus decides whether to refine the engine, for example by adding thermal mass or splitting the house into two zones.
- **Hourly steps with a single zone and no thermal mass** may misjudge heat pump behaviour in cold snaps. This is accepted for now and stated in the report.

### Security considerations
- There is no server, no user data and no secrets in this phase.
- Dependencies are kept minimal and pinned through the lockfile.

### Accessibility considerations
- Not applicable until phase 3. The report is plain Markdown.

---

## Technical debt introduced

- **Independent sampling.** Parameters are sampled without correlations. Track it as a `technical-debt` issue when the code lands.
- **Annual average grid carbon.** It is replaced by an hourly profile in phase 2.

---

## Related documentation

- [Project outline](./ORIGINAL_IDEA/project-outline.md): scope and goals.
- [Model and register spec](./ORIGINAL_IDEA/home-energy-simulator-spec.md): parameter detail and sources.
- [testing-strategy.md](../REFERENCE/testing-strategy.md): testing approach.
