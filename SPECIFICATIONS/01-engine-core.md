# Phase 1: engine core

## Phase overview

**Phase number:** 1
**Phase name:** Engine core (headless)
**Estimated timeframe:** 4–6 weeks of side-project time. Sourcing the register values is the longest task, not the code.
**Dependencies:** None. This is the starting phase.

**Brief description:**
This phase proves two things before anything else is built. First, that a simple hourly engine gets a house's **heat demand** right, checked against independent references. Second, that the **trust plumbing** works: every number comes from a sourced register row, results are honest ranges, and two setups are compared fairly. The phase uses one house archetype in one location, comparing a gas boiler with an air source heat pump on the price cap. There is no user interface. The phase ends with a plain-language report Magnus and an outside expert can check without running code.

What phase 1 deliberately does **not** test is hourly heat pump behaviour. On a flat tariff, only the heat pump's seasonal efficiency affects the result, so the COP curve, flow temperature and time-of-use tariffs move to phase 2, where they change the answer.

Background: [project-outline.md](./ORIGINAL_IDEA/project-outline.md) (scope and goals) and [home-energy-simulator-spec.md](./ORIGINAL_IDEA/home-energy-simulator-spec.md) (model and register detail). Decisions: [client-side snapshots ADR](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md) and [register format ADR](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md).

---

## Scope and deliverables

### In scope
- [ ] **Benchmark spike, first:** a rough heat-demand calculation for the archetype and an attempt to run HEM. It runs alongside the tooling work, so a bad result can reshape the engine before it is built. *(Step 1, the rough calculation, is done: see [scripts/benchmark/](../scripts/benchmark/README.md).)*
- [ ] **Repository tooling:** TypeScript (strict), Vitest with coverage, linting, and a GitHub Actions workflow for type checking, lint, tests and report drift. *(Done except the report-drift step, which lands with the report.)*
- [ ] **The register schema**, with typed row kinds, and the single register data file validated against it.
- [ ] **Register rows** for everything phase 1 uses (see "Register contents"), each with a source or a stated rationale.
- [ ] **A build-time PVGIS snapshot** for London, with its own validated schema.
- [ ] **The hourly engine:** geometry and heat loss, internal and solar gains, space heat at a mean internal temperature, hot water, heat supply, cost and carbon, over 8,760 hours.
- [ ] **Paired, seeded sampling** for uncertainty bands, and paired comparison of two setups.
- [ ] **A sensitivity table:** each uncertain row run at its low and high value, ranked by effect.
- [ ] **A generated report**, `reports/phase-1-london-semi.md`, committed to the repo and checked for drift in CI.
- [x] **The two ADRs** (client-side snapshots, register format), written alongside this spec.
- [ ] **Tests**, plus `REFERENCE/engine.md` and `REFERENCE/register.md`.

### Out of scope (phase 2 or later)
- The heat pump COP curve versus outdoor temperature, flow temperature, and fitting either to Electrification of Heat data.
- Time-of-use tariffs, an hourly grid-carbon profile, and regional price-cap rates.
- Heat pump sizing against a design temperature, and backup heating.
- Thermal mass and intermittent heating schedules.
- Weather variation between years. Phase 1 uses one fixed typical year.
- Other archetypes, quick-facts inputs, solar PV, capital costs, grants and payback.
- Any user interface (phase 3).

### Acceptance criteria
- [ ] The benchmark result is recorded, with the decision it triggers (see "Benchmark"), before the engine PR is merged.
- [ ] `npm run report` regenerates the report from the register and snapshot alone, with no network access, and produces byte-identical output on a second run.
- [ ] The report shows, for both setups: annual heat demand, kWh by fuel, running cost and carbon, each as a central value plus a 10th–90th percentile range and the median. It also shows the paired difference (gas minus heat pump), the share of samples in which the heat pump is cheaper, the sensitivity table, the benchmark result, the data dates, the seed and sample count, and the limitations.
- [ ] Every non-constant number the engine uses comes from a register row, enforced as described under "Register integrity".
- [ ] The register fails validation, with a message naming the row and field, for every rule under "Register integrity".
- [ ] All physics, register and sampling tests pass. Coverage is 95%+ for lines, functions and statements and 90%+ for branches, type checking passes, and CI is green.
- [ ] Magnus has read the report, and it has been sent to at least one outside reviewer (the EV-industry friend or an installer), with their comments noted.

---

## Technical approach

### Architecture decisions

**The engine is a pure library.** A dependency-light TypeScript module with no I/O. The register loader validates an already-parsed object; file reads happen only in `scripts/`. The same engine and loader then run unchanged in tests, the report script and the phase 3 browser app. Keeping the engine separate from the UI also means the 3D street can read results but never change them.

**Data snapshots are taken at build time, and the site is fully client-side.** PVGIS [forbids browser calls](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en), so external data is fetched by scripts and committed. This is the privacy decision: no server ever holds a visitor's details. See the [ADR](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md).

**The register is one file of typed rows.** See the [ADR](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md) and "Register schema" below.

**Uncertainty comes from paired, seeded sampling.** The engine draws N joint samples (default 500), each taking a value for every *uncertain* row, and runs the full year for each. The central result is the run with every row at its default. The band is the 10th–90th percentile of the samples, and the median is reported too. Skewed distributions can put the central value outside the band, and the report then says so plainly.
- **Paired comparison.** Both setups run on the same samples. The engine reports the distribution of the per-sample difference, **gas cost minus heat pump cost** (positive means the heat pump is cheaper), and the share of samples in which the heat pump is cheaper. An exact tie counts as half a win for each.
- **Stable draws.** Each value comes from its own uniform number, derived by hashing (seed, sample index, row id), then passed through the row's inverse distribution function. Adding or reordering rows therefore never shifts other rows' draws, and "raise SPF, cost falls" holds sample by sample.
- **Degenerate ranges.** A row whose low equals its high always returns its default. There is no division by zero.
- **Monte Carlo noise.** At N = 500 the share-of-wins figure has a standard error of about 2 percentage points, which is roughly ±4.5 points at 95% confidence. The report therefore rounds it to the nearest 5%.

### What is sampled, and what is fixed

Phase 1 samples only the parameters whose uncertainty matters for one house, and fixes the rest. That stops independent draws hiding a real correlation.

| Sampled (uncertain) | Fixed in phase 1 |
| --- | --- |
| Fabric quality factor: one shared multiplier on every U-value and the air change rate | Geometry |
| Mean internal temperature | Weather (one typical year) |
| Heat pump SPF | Price-cap unit rates and standing charges |
| Boiler seasonal efficiency | Carbon factors |
| Hot water use | Physical constants |
| Internal gains | |
| Base electricity use | |

**The fabric quality factor** replaces sampling each U-value on its own. Independent draws would average out and make the band look narrower than the real uncertainty. BRE found RdSAP's old solid-wall default was pessimistic by about a quarter, so the factor's range must allow for the stock being *better* than the tables, not just worse. Its row cites that finding.

**Prices are fixed** at the price cap because, with running costs nearly level, independently sampled gas and electricity prices would decide the headline "share of wins" on their own. Price uncertainty returns in phase 2 as a shared price-level scenario.

### Register schema

Every row has an `id`, `section`, `label`, `unit`, `status` (`sourced`, `to-verify` or `approximate`), `lastChecked` (ISO date), `refreshCadence` (`quarterly`, `yearly`, `static` or a number of months), `overridable`, `overrideHint` and `dependsOn` (a list of row ids).

The provenance field depends on the status:
- `sourced` or `to-verify` rows need `source: { title, url }`.
- `approximate` rows need `rationale` (why this value is reasonable) and may add a `source`.

The value fields depend on the row kind:

| Kind | Holds | Required fields |
| --- | --- | --- |
| `uncertain` | A scalar with a range | `default`, `low`, `high`, `distribution` (`triangular` or `lognormal`). For a triangular row, `default` is the mode. Lognormal rows also give `median` and `sigma`, `default` must equal `median`, and draws are clipped at `low`/`high`. |
| `fixed` | A scalar with no range | `value` |
| `series` | A reference to a snapshot file | `file`, `schema` (the snapshot schema name) and `columns` |
| `profile` | A short fixed shape, such as a daily pattern | `values` (an array) and `resolution` |

### Register integrity

Validation fails with a message naming the row and field when:
- a required field for the row's kind or status is missing;
- an `uncertain` row's default lies outside its low–high range, or its low is above its high;
- a lognormal row's `default` differs from its `median`;
- two rows share an `id`;
- a `dependsOn` entry names a missing row, or the dependencies form a cycle;
- `lastChecked` is not a valid ISO date.

A row past its `refreshCadence` is not an error. It produces a warning, and the report lists such rows under "data dates".

**Every number comes from a row.** Physical constants and unit conversions live in `src/engine/constants.ts`: hours per year, the heat capacity of air (0.33 Wh/m³K), the specific heat of water, and kWh conversions. Everything else is read through a typed accessor. Row ids are a TypeScript union, and a parity test checks that the union and the register file contain exactly the same ids. The accessor throws an error naming the id if asked for one that doesn't exist.

### The phase 1 physics

**Geometry and heat loss.**

```latex
H = f_{fabric}\Big(\sum_i U_i A_i + 0.33\, n\, V\Big)
```

H is in W/K. Element areas (external walls, roof, ground floor, windows, door) and heated volume come from geometry rows for the archetype. They are derived with RdSAP 10's dimension conventions and cross-checked against an MCS heat loss calculator run for the same house. The party wall is treated as having no heat loss, with the U-value convention checked against RdSAP and recorded in its row. The floor U-value is computed offline using the method RdSAP specifies, typically from perimeter and area, and stored as a fixed row with its working.

**Space heat at a mean internal temperature.** Phase 1 heats continuously to a single mean internal temperature, following SAP's approach. This avoids the "house drops to outdoor temperature when the heating goes off" error that intermittent heating without thermal mass would cause, which would roughly halve annual demand. The mean internal temperature row is uncertain, and it carries the behaviour uncertainty.

```latex
Q_{heat}(t) = \max\big(0,\; H\,(T_{mean} - T_{out}(t)) - G_{solar}(t) - G_{internal}\big)
```

**Internal gains.** A constant wattage from occupants, lighting and appliances, as an uncertain row derived SAP-style from floor area and occupancy. Constant gains are safe in summer, because the `max(0, …)` clamp means surplus gains never produce negative demand. Seasonal variation can come later if the benchmark shows it matters.

**Solar gains.** Windows are split equally across four orientations (north, east, south and west). Each hour, irradiance on each vertical orientation is computed from the PVGIS horizontal global, beam-normal and diffuse values. The calculation uses solar position and a simple isotropic-sky transposition, which is well documented and testable against published examples. Gains equal window area × g-value × frame factor × shading factor × vertical irradiance. The g-value, frame factor and shading factor are fixed rows from RdSAP.

**Hot water.**

```latex
Q_{dhw,day} = \frac{L \times 4.18 \times (T_{del} - T_{cold})}{3600} + Q_{loss}
```

L is litres per day (uncertain, from occupancy), the delivery temperature is a fixed row, and the cold-feed temperature is a fixed annual average in phase 1 (monthly variation is phase 2). The gas setup is a **combi boiler**, so it has no cylinder loss. The heat pump setup has a **cylinder**, so it has a daily standing-loss row. Daily hot water energy is spread evenly across the hours of the day, which doesn't affect results on a flat tariff.

**Heat supply.**
- Gas: gas used = (space heat + hot water) ÷ boiler seasonal efficiency. One efficiency covers both uses.
- Heat pump: electricity used = (space heat + hot water) ÷ SPF. Phase 1 uses one SPF for both, so its row must state whether the field figure includes hot water. If it doesn't, a separate hot water efficiency row is added; one figure is never counted twice.
- The heat pump has unlimited capacity and no backup heater. This simplification is stated in the report.

**Electricity, cost and carbon.**
- Base electricity (lights and appliances) is the same in both setups. The boiler's own pump and fan electricity is left out in phase 1, and the report states this.
- Cost = kWh × unit rate + standing charges. The electricity standing charge applies to both setups. **The heat-pump-only house has no gas supply (it is assumed to have no gas hob), so it pays no gas standing charge.**
- Gas kWh are on a gross calorific value basis, as billed. Carbon = gas kWh × gas factor + electricity kWh × annual average grid factor. Both factors are kgCO₂e from the DESNZ conversion factors, with the factor year pinned in the row.

**A worked check to keep in the tests.** On the October–December 2026 price cap, heat from a heat pump at SPF 2.8 costs 26.32 ÷ 2.8 ≈ 9.40p per kWh. Heat from an 85% boiler costs 7.97 ÷ 0.85 ≈ 9.38p per kWh. Running costs are nearly level, so the result turns on the SPF and the £108 a year gas standing charge. The test reproduces these figures to within 0.01p.

### Register contents for phase 1

**The archetype: a semi-detached house built 1930–49, two storeys, about 90 m², cavity walls as built (unfilled), 100 mm of loft insulation, double glazing retrofitted.** A variant with no loft insulation (RdSAP's default for the age band) is kept for comparison. Magnus chose 100 mm as the main case on 17 October 2026, because most real 1930s semis have had loft insulation added. Wall construction moves results a lot. Solid-wall and filled-cavity variants come with phase 2's archetypes.

- **Location and weather:** a `series` row for the PVGIS v5.3 typical year at London (51.507, −0.128). A fixed outdoor-temperature offset row (default 0 K) lets tests build a "colder year".
- **Geometry:** element areas, storey height, heated volume and ground floor perimeter, each a fixed row with its derivation.
- **Fabric:** U-values for walls, roof, floor, windows and door, and the air change rate, as fixed rows from the RdSAP 10 England tables; plus the uncertain fabric quality factor.
- **Gains:** internal gains (uncertain), and g-value, frame factor and shading factor (fixed).
- **Heating and hot water:** the mean internal temperature (uncertain), boiler seasonal efficiency (uncertain), the heat pump SPF (uncertain, see below), hot water litres per day (uncertain), delivery and cold-feed temperatures (fixed), and the cylinder standing loss (fixed).
- **Prices and carbon:** the GB average price cap by Direct Debit for October–December 2026, verified against Ofgem on 2026-10-17, as fixed rows; the gas carbon factor; and the annual grid carbon factor.
- **Base electricity:** uncertain, cross-checked against Ofgem's typical consumption figure.

**The SPF distribution is fitted to field data, not the full spread of sources.** The Electrification of Heat trial's median is 2.8. RHI monitoring found about 30% of air source heat pumps reaching SPF 3.0 or above, and about 8% reaching 3.5. The row uses a lognormal distribution with a median of 2.8. A sigma of about 0.145 gives roughly 32% above 3.0 and 6% above 3.5, which is a reasonable starting fit to verify and record. The row is clipped to 2.0–4.0. HeatpumpMonitor's figure of about 4.0 is a self-selected sample, so it is not the default upper range. It describes a "well-installed" setup, which is a separate option for phase 2.

### Benchmark (do this first)

The project's riskiest assumption is that a simple hourly engine gets heat demand right. It is tested before the engine is built.

1. **A rough calculation in the first week**, alongside the tooling PR: a short script computing H and annual space heat for the archetype from the draft register rows. It sets an early expectation.
2. **A HEM spike of at most two days.** Get DESNZ's open-source Home Energy Model running with an input matching our archetype: the same geometry, U-values, mean internal temperature or a continuous schedule, and gains. Use the same weather if HEM can accept it; check whether a PVGIS typical year can be converted to HEM's weather format. Agree in advance which HEM output counts as "space heat". Commit the HEM version and input file, so the run can be reproduced.
3. **If HEM can't be run in that time, use measured data instead.** Use DESNZ's National Energy Efficiency Data-Framework (NEED) consumption statistics by property type and age band. Check that they break out semi-detached houses of this period before relying on them. Add Magnus's own bills if his house is similar. The MCS heat loss calculator only checks our heat loss sum, because it uses the same tables, and the report says so.
4. **The decision rule, set in advance.** If annual space heat is within 15% of the reference, proceed. Between 15% and 30%, add a single thermal-mass node to the engine before phase 2. Above 30%, stop and revisit the single-zone approach with Magnus. The report states the reference used, which quantity it checks, the gap, and the decision taken.

### Technology choices

- **Language:** TypeScript in strict mode, on the current Node LTS.
- **Tests:** Vitest with V8 coverage.
- **Schema validation:** Zod.
- **Scripts:** TypeScript scripts run with `tsx`.
- **CI:** GitHub Actions.
- **Versions:** check the current stable release of each tool at set-up; don't copy versions from memory.
- **Typed arrays:** the hourly loop uses typed arrays and no per-hour objects. That keeps 500 samples × 8,760 hours × 2 setups (about 9 million steps) well under a second.

The web framework and hosting for phase 3 are not chosen in this phase.

### Key files and components

```
data/
  ├── register.json                 # every parameter, one typed row each
  └── snapshots/
      └── pvgis-tmy-london.json     # trimmed to the columns used, with JRC attribution
src/
  ├── register/
  │   ├── schema.ts                 # Zod schemas: row kinds, provenance, integrity
  │   ├── ids.ts                    # the RowId union
  │   ├── load.ts                   # validates a parsed object (no file reads)
  │   └── *.test.ts
  ├── snapshots/
  │   ├── pvgisSchema.ts            # snapshot schema
  │   └── *.test.ts
  ├── engine/
  │   ├── constants.ts              # physical constants only
  │   ├── geometry.ts               # areas, volume, H
  │   ├── solar.ts                  # solar position, vertical irradiance, gains
  │   ├── demand.ts                 # space heat and hot water, hourly
  │   ├── supply.ts                 # boiler and heat pump
  │   ├── costCarbon.ts             # tariffs and carbon
  │   ├── simulate.ts               # one house, one setup, one year
  │   ├── sampling.ts               # hashed, seeded draws; inverse distribution functions
  │   ├── compare.ts                # paired comparison and share of wins
  │   ├── sensitivity.ts            # one-row-at-a-time table
  │   └── *.test.ts
  └── types.ts
scripts/
  ├── fetch-pvgis.ts                # writes the snapshot
  ├── report.ts                     # reads files, runs the engine, writes the report
  ├── bench.ts                      # timing check, outside the coverage run
  └── benchmark/                    # rough calculation, HEM input and notes
reports/
  └── phase-1-london-semi.md        # generated and committed
.github/workflows/ci.yml
REFERENCE/
  ├── engine.md
  └── register.md
```

The engine's tests use small inline fixture registers, so the engine PR doesn't wait for the real register rows. The real register is first loaded by the report script.

**Files to modify:** root `CLAUDE.md` (stack, commands and current phase), `REFERENCE/CLAUDE.md` (links to the new docs), and `README.md` (replace the template text).

---

## Testing strategy

### Unit tests

**Coverage targets:** lines, functions and statements 95%+; branches 90%+. The one-off fetch script is excluded from coverage. Its output is guarded by the snapshot schema test instead.

**Physics checks:**
- A year has exactly 8,760 steps, and annual totals equal the sum of the hours.
- Heat supplied equals heat demanded in every hour.
- Heat demand is zero in any hour where gains cover the loss.
- A lower fabric quality factor always lowers annual heat demand; a lower outdoor-temperature offset always raises it.
- A higher SPF always lowers the heat pump's electricity use, in every sample.
- Gas use scales exactly with 1 ÷ boiler efficiency.
- The heat-pump-only setup pays no gas standing charge, and both setups pay the electricity standing charge.
- Vertical irradiance matches a published worked example for a known sun position, to within 2%.
- The worked price check above is reproduced to within 0.01p.
- A fixture house with hand-calculated H, documented in `REFERENCE/engine.md`, is reproduced exactly.

**Register and snapshot checks:**
- The real register and snapshot files validate.
- Each integrity rule fails with a message naming the row and the field.
- The id parity test passes, and reading an unknown id throws an error naming it.
- A snapshot with a missing column, the wrong row count, or a leap day fails with a clear message. Snapshot timestamps are UTC, and the convention is documented in the snapshot row.

**Sampling and comparison checks:**
- The same seed gives identical results, and a different seed gives different samples.
- Adding a new row leaves every existing row's draws unchanged.
- A row with low equal to high always returns its default.
- The central run uses only default values.
- With every uncertain range collapsed, the band collapses to the central value.
- Two identical setups give a difference of zero in every sample, and a share of wins of exactly 0.5.
- The share of wins rises when the heat pump is made strictly better.
- The lognormal SPF row reproduces its target percentiles to within 2 percentage points over 100,000 draws.

### Integration tests
- [ ] The register and snapshot produce a report offline, and two runs give byte-identical output. Reports contain no timestamps; numbers are rounded to £10, 100 kWh, 10 kgCO₂e and 5% for shares.
- [ ] CI regenerates the report and fails if it differs from the committed copy.

### Performance check
`npm run bench` runs 500 samples × 2 setups outside the coverage run and logs the time taken. It runs in CI on every PR, and fails only if it takes longer than 5 seconds. That is many times the expected time, so it catches a real slowdown without flaky failures on shared runners.

### Manual checklist
- [ ] Magnus reads the report and the numbers look plausible.
- [ ] The report goes to an outside reviewer, and their comments are noted in the PR.
- [ ] Changing one register value (for example, the SPF median to 3.2) moves the result in the expected direction.

---

## Pre-commit checklist

- [ ] Tests pass (`npm test`), type checking passes (`npm run typecheck`), and coverage meets targets (`npm run test:coverage`).
- [ ] The report regenerates offline with no diff (`npm run report`).
- [ ] The docs are updated: `REFERENCE/engine.md`, `REFERENCE/register.md`, the indexes and root `CLAUDE.md`.
- [ ] There is no debug output and there are no secrets. Phase 1 needs no API keys.

---

## PR workflow

Phase 1 lands as several PRs:
1. `feature/phase-1-tooling`: the repo set-up and CI, plus `scripts/benchmark/` with the rough heat-demand calculation (benchmark step 1).
2. `feature/phase-1-benchmark`: the HEM spike or measured-data fallback (steps 2–4), started as soon as PR 1 is merged, with the decision recorded before the engine PR.
3. `feature/phase-1-register`: schemas, loader, id parity, the PVGIS snapshot and the phase 1 rows.
4. `feature/phase-1-engine`: geometry, solar, demand, supply, and cost and carbon, with the physics tests (on fixture registers).
5. `feature/phase-1-ranges-report`: sampling, comparison, sensitivity, the report, and the drift and bench checks in CI.

Run `/review-pr` on each. PR 1 touches CI and dependencies, so it will be triaged to the team tier, as expected. Nothing is deployed in phase 1.

---

## Edge cases and considerations

### Known risks
- **HEM may be hard to run.** Mitigated by the two-day limit, the measured-data fallback and the decision rule above.
- **The NEED statistics may not isolate 1930s semis.** If so, use the nearest available breakdown, and state the mismatch in the report.
- **A single zone with continuous heating** can't show the gains from a smart heating schedule. That is acceptable, because it isn't a phase 1 question.
- **Sourcing the register takes time.** Geometry, gains and hot water rows are the long pole. Rows that can't be sourced in time are marked `approximate` with a rationale rather than left blank.

### Security
- No server, no user data and no secrets. Dependencies stay minimal, and the lockfile pins them.

---

## Technical debt introduced

Each item is tracked as a `technical-debt` issue when its code lands:
- **No thermal mass**, with continuous heating (possibly resolved early by the benchmark decision rule).
- **Independent sampling** of the remaining uncertain rows, apart from the shared fabric factor.
- **Fixed prices and fixed weather** in phase 1.
- **An annual average grid carbon factor.**
- **Boiler auxiliary electricity left out.**

---

## Related documentation

- [Project outline](./ORIGINAL_IDEA/project-outline.md) and [model and register spec](./ORIGINAL_IDEA/home-energy-simulator-spec.md)
- [ADR: client-side, build-time snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md)
- [ADR: typed parameter register](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md)
- [testing-strategy.md](../REFERENCE/testing-strategy.md)
