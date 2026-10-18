# Phase 2: complete v1 model

## Phase overview

**Phase number:** 2
**Phase name:** Complete v1 model (headless)
**Estimated timeframe:** 8–12 weeks of side-project time. As in phase 1, sourcing register values is the long pole.
**Dependencies:** Phase 1 (complete). The engine, register, sampling and report from phase 1 are extended, not replaced.

**Brief description:**
Phase 2 turns the one-house engine into the model v1 needs:
- **Many houses:** a curated set of house types, adjusted by quick facts.
- **Four setups:** gas boiler or air source heat pump, each with or without roof solar.
- **Tariffs:** the price cap and Octopus time-of-use tariffs.
- **Results:** running cost, carbon, upfront cost after grants and payback, as honest ranges.

For time-of-use tariffs to mean anything, the engine has to know *when* the house is heated. So phase 2 adds thermal mass and heating schedules, and checks them against HEM before they are relied on. There is still no user interface (phase 3), and London is still the only location.

Magnus set this scope on 18 October 2026:
- trim phase 2 to the v1 feature list in the [project outline](./ORIGINAL_IDEA/project-outline.md);
- add heating schedules with thermal mass;
- use a heat pump efficiency curve tied to the field-measured SPF;
- use a curated set of house types.

Background: [project-outline.md](./ORIGINAL_IDEA/project-outline.md) and [home-energy-simulator-spec.md](./ORIGINAL_IDEA/home-energy-simulator-spec.md). Phase 1: the [archived spec](./ARCHIVE/01-engine-core.md), [engine.md](../REFERENCE/engine.md) and [register.md](../REFERENCE/register.md). Decisions: the [client-side snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md), [typed register](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md) and [calibration](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md) ADRs.

---

## Scope and deliverables

### In scope
- [ ] **House types:** a curated set of about 10 archetypes (type × age band, with floor area as an input). Geometry is derived in the engine from a few archetype facts. See "House types and geometry".
- [ ] **Quick facts:** loft insulation, wall insulation, glazing and occupants. Each answer maps to register values through a table, not code. See "Quick facts".
- [ ] **Thermal mass and heating schedules:** a single thermal-mass node, with heating periods and a setpoint in place of continuous heating to one mean temperature. It is checked against HEM under the same schedule, with the comparison rules committed before the run, as in phase 1. The behaviour rows are then recalibrated to NEED. See "Heating over time".
- [ ] **Hourly heat pump behaviour:** a COP curve against outdoor temperature and flow temperature. It is scaled so the year's result equals the sampled SPF. Hot water runs at its own, higher flow temperature, and the cylinder is reheated on a schedule. A labelled "well-installed" option is included. See "The heat pump over the year".
- [ ] **Tariffs:**
  - the price cap for the London region, replacing the GB average;
  - Octopus Cosy (time-of-use for heat pumps) and Agile (half-hourly, from the last 12 months of actual rates), from a build-time snapshot;
  - an export rate for solar.

  Simple, rule-based control moves heat pump running into cheap hours. See "Tariffs and control".
- [ ] **Solar PV:** hourly generation from the PVGIS weather, self-consumption and export, checked against PVGIS's own PV calculator. See "Solar PV".
- [ ] **Capital costs, grants and payback:**
  - installed costs for the heat pump, a replacement boiler and PV;
  - the Boiler Upgrade Scheme grant;
  - equipment lifetimes;
  - payback against replacing the boiler like for like, under a shared price scenario.

  See "Costs, grants and payback".
- [ ] **Boiler auxiliary electricity** for the gas setups, which closes [#18](https://github.com/mannepanne/energy-sim/issues/18).
- [ ] **Correlated sampling** where rows share a cause, such as hot water use and internal gains through occupancy. This closes [#20](https://github.com/mannepanne/energy-sim/issues/20).
- [ ] **The phase 2 report**, `reports/phase-2-v1-model.md`:
  - the London 1930s semi in full: four setups × three tariffs, with ranges, payback and sensitivity;
  - an archetype table, with each type's central result and its gap from NEED.

  It is committed and checked for drift in CI, as in phase 1.
- [ ] **The ADRs** listed under "Architecture decisions", written alongside this spec.
- [ ] **Tests**, plus updates to `REFERENCE/engine.md` and `REFERENCE/register.md`.

### Out of scope (later phases or deferred)
- Any user interface, and user overrides through it (phase 3). The phase 3 notes in [SPECIFICATIONS/CLAUDE.md](./CLAUDE.md) still apply.
- Weather variation between years. One PVGIS typical year stays.
- An hourly grid-carbon profile. The annual factor stays ([#17](https://github.com/mannepanne/energy-sim/issues/17) carries forward).
- Heat pump sizing against a design temperature, and backup heating. The heat pump keeps unlimited capacity, and the report says so.
- Locations other than London, and regional rates other than London's.
- Insulation and glazing upgrades as comparable options. Quick facts describe the house as it is.
- Home batteries, EVs, hybrid heat pumps, and calibration from a user's bills.

### Acceptance criteria
- [ ] Every archetype's derived geometry reproduces a hand calculation for at least two archetypes, documented in `REFERENCE/engine.md`. The RdSAP rows it uses are checked line by line, which closes [#9](https://github.com/mannepanne/energy-sim/issues/9). The ground floor U-value uses the RdSAP method, which closes [#7](https://github.com/mannepanne/energy-sim/issues/7).
- [ ] The thermal-mass engine is checked against HEM under the same heating schedule. The rules (which output, which schedule, what tolerance) are committed before the run. Annual space heat for the 1930s semi is within 15% of HEM, or the decision rule below is applied and recorded.
- [ ] The behaviour rows are recalibrated so the 1930s semi's central gas use hits a target fixed before the recalibration is run. Every other archetype's gap from its NEED reading is shown, not fitted away.
- [ ] Over the year, the heat pump's hourly COP gives exactly the sampled SPF for the combined space and hot water heat, to within 0.1% in every sample.
- [ ] PV generation for a reference system is within 5% of PVGIS's own PV calculator for the same location and system.
- [ ] `npm run report` regenerates the phase 2 report offline and byte-identically, and CI checks it for drift. It shows:
  - for each of the four setups and three tariffs: running cost, carbon, upfront cost after grant and payback, as central, median and P10–P90;
  - the paired differences against the gas boiler without solar, and the share of samples in which each setup is cheapest;
  - the sensitivity table;
  - the archetype table and the HEM and PV checks;
  - the data dates and the limitations.
- [ ] One central run of one house, with all four setups and all three tariffs, takes under 100 ms on the bench machine. Phase 3 needs this to run interactively in a browser.
- [ ] Every open `technical-debt` issue is either closed by this phase or carried forward in "Technical debt", by number.
- [ ] Tests pass, with coverage at 95% or above for lines, functions and statements and 90% or above for branches. Type checking and lint pass, and CI is green.

Validation against real homes and expert review stay after the beta launch and don't gate this phase.

---

## Technical approach

### Architecture decisions

These need ADRs before the PR that relies on them is merged. Magnus confirms each one.

1. **Archetype tables and derived geometry.** This amends the [typed register ADR](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md):
   - **A new row kind, `table`,** holds values keyed by archetype or by a quick-facts answer. Examples: U-values by RdSAP age band and construction, and window area by age band.
   - **Geometry moves into the engine.** Element areas and volume are derived from floor area, storeys, house type and footprint shape, instead of being stored as rows. This also settles the phase 3 question about overriding rows that others depend on.
   - **The parity test and the throwing accessor** extend to table keys.
2. **Heating schedules with one thermal-mass node.** This supersedes part of the [calibration ADR](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md):
   - The engine heats to a setpoint during heating periods and lets the house cool, against its thermal mass, outside them.
   - The calibrated behaviour moves from one continuous mean temperature to the setpoint and heating hours.
   - It is re-benchmarked against HEM with pre-registered rules.
3. **A heat pump COP curve anchored on the field SPF.** The curve's shape (COP against outdoor and flow temperature) sets *when* electricity is used. A scale factor, solved per sample, makes the annual result equal the sampled SPF. So the field-measured SPF row stays the anchor, and a brochure figure can never make the model optimistic.
4. **Rule-based tariff control.** Fixed, published rules move heat pump and hot water running into cheap periods. There is no optimiser, so results are explainable and fast.

The engine stays a pure library, and data stays build-time snapshots. The report's seed, sample count and setup list are method settings in code, as allowed by the amended register ADR.

### House types and geometry

**The curated set** (final list confirmed in the first PR, from NEED's most common type × age combinations in London):
- Mid-terrace and end-terrace, pre-1919, solid brick
- Semi-detached, 1930–49, cavity (the phase 1 house, kept as the reference)
- Semi-detached, 1950–66, cavity
- Mid-terrace, 1967–82, cavity
- Detached, 1967–82, cavity
- Bungalow, 1950–75, cavity
- Detached, 1983–2002, cavity, insulated as built
- Semi or terrace, 2003 onwards, insulated as built
- A purpose-built flat is out (no roof or ground floor of its own; it needs a different geometry)

**Each archetype is a few facts:** type, RdSAP age band, storeys, default floor area, footprint aspect ratio, number of party walls, and wall construction. Floor area is an input with a range; the default is NEED's or EPC data's typical figure for the type and band.

**Derived geometry** (engine code, tested):
- footprint = floor area ÷ storeys; plan width and depth from the aspect ratio;
- exposed perimeter = footprint perimeter minus party wall lengths;
- wall area = exposed perimeter × storey height × storeys, less windows and doors;
- window area from the RdSAP age-band formula; door area fixed;
- roof and ground floor = footprint (bungalow: one storey);
- heated volume = floor area × storey height.

Storey height and window formulas come from RdSAP 10 tables, as `table` rows keyed by age band.

**Fabric** comes from RdSAP 10 England tables keyed by age band and construction, pulled into `table` rows and checked line by line (closes #9). The ground floor U-value uses the RdSAP / BS EN ISO 13370 method from perimeter and area, computed in the engine (closes #7).

### Quick facts

Each answer selects or adjusts register values through a `table` row, so adding an answer never needs code:
- **Loft insulation:** none, about 100 mm, 270 mm or more → roof U-value.
- **Walls:** as built, cavity filled, solid wall insulated → wall U-value. Only answers that fit the archetype's construction are offered.
- **Glazing:** single, older double, newer double or triple → window U-value and g-value.
- **Occupants:** 1–5 → hot water litres a day and internal gains, using the SAP occupancy relationships, and drawn together when sampled (closes #20 for these rows).

The archetype's defaults correspond to the most common answer for its age band, stated in each row's rationale.

### Heating over time

**One thermal-mass node.** Each hour:

```latex
C \frac{dT_{in}}{dt} = Q_{heat}(t) + G_{solar}(t) + G_{internal}(t) - H\,\big(T_{in}(t) - T_{out}(t)\big)
```

- **C** is the house's effective heat capacity, from SAP's thermal mass parameter for the construction (a `table` row by construction). It is solved hour by hour with a stable implicit step.
- **During heating periods,** the heating supplies what is needed to reach the setpoint, without exceeding its output. The output is unlimited in phase 2, as stated.
- **Outside heating periods,** the house cools freely.

**Heating schedules** are `profile` rows:
- The default follows SAP's pattern: weekdays 07:00–09:00 and 16:00–23:00; weekends 07:00–23:00.
- The setpoint is uncertain.
- **For the heat pump setups,** a separate schedule row allows longer, lower heating. This is the normal way heat pumps are run. It addresses the bias in [#15](https://github.com/mannepanne/energy-sim/issues/15). The default needs a source. Until one is found, the row is approximate and equal to the gas schedule, and the sensitivity table shows the effect of changing it. The neutrality rule means it is never tuned to favour either setup.

**Benchmark first, as in phase 1:**
1. Commit the comparison rules before running: the HEM output, the schedule (HEM's own `SetpointTimeControl`), the setpoint, the house and the tolerance.
2. Run HEM on the 1930s semi with the same schedule.
3. Compare annual space heat.
4. **The decision rule:**
   - within 15%, proceed;
   - between 15% and 30%, review C and the control logic with Magnus before going on;
   - above 30%, stop and revisit.

   As before, the engine test then guards a tighter 10% against regressions.

**Recalibration.** Once the benchmark passes:
- the setpoint's central value is solved so the 1930s semi's central gas use hits the NEED target (13,200 kWh, fixed now, as in phase 1);
- the setpoint's range is set by NEED readings A and C;
- the other archetypes use the same behaviour rows, and their gap from their own NEED type × age reading is reported as a diagnostic, not fitted. That gap is the evidence on [#14](https://github.com/mannepanne/energy-sim/issues/14) (fabric versus behaviour).

### The heat pump over the year

**The COP curve.** Each hour:

```latex
COP(t) = k \cdot \eta_{carnot}\,\frac{T_{flow} + 273.15}{T_{flow} - T_{out}(t) + \Delta T_{lift}}
```

- The shape is Carnot-based: efficiency falls as the gap between flow and outdoor temperature grows.
- T_flow is the space heating flow temperature (uncertain; a weather-compensation curve sets it from T_out) or the hot water flow temperature (fixed, higher).
- **k is solved per sample** so that total heat ÷ total electricity over the year equals the sampled SPF exactly. The shape decides when electricity is used, and the SPF row decides how much.
- The shape's parameters and the compensation curve are cross-checked against the Electrification of Heat trial's published performance by outdoor temperature (the open-access cleansed daily dataset, SN 9210, or the trial's reports). This is a check, not a fit.

**The "well-installed" option** is a separate, clearly labelled setup choice, not the default. It uses a higher SPF distribution anchored on HeatpumpMonitor.org's self-selected sample, and the report says that sample is self-selected.

**Hot water** for the heat pump setups: the cylinder is reheated in scheduled windows (a `profile` row), at the hot water flow temperature. Its standing loss continues as in phase 1. The gas setups stay combi boilers.

**Boiler auxiliary electricity** (pump and fan) is added to the gas setups as a row in kWh a year, spread over heating hours (closes #18).

### Tariffs and control

- **Price cap:** the London region's rates replace the GB average. The rows are sourced from Ofgem's regional table, with a quarterly cadence and `validUntil`, as now.
- **Octopus Cosy:** cheap, standard and peak periods from the Octopus product API, for the London region.
- **Octopus Agile:** the last 12 months of actual half-hourly London rates form a typical year. The report states that Agile is volatile, and that a past year is not a forecast.
- **Export:** a flat export rate for solar, such as Octopus Outgoing Fixed or a typical Smart Export Guarantee rate (decided when the snapshot is built).
- **A tariff is a `series` or `profile` row**, so every setup can run on every tariff with one code path. The gas setups stay on the price cap for gas. Their electricity uses the chosen tariff, because base electricity and solar export still apply.

**Control rules for the heat pump setups** (published in `REFERENCE/engine.md`, and the same for every tariff):
- **Preheat:** during the cheapest periods, the setpoint is raised by a fixed boost (an uncertain row, around 1–2 K), within a comfort cap.
- **Coast:** during peak periods, the setpoint is lowered by the same amount.
- **Cylinder:** the cylinder is reheated in the cheapest periods that fit the hot water schedule.
- **Agile:** "cheapest" means each day's cheapest hours, ranked.

### Solar PV

- **Generation** comes from the PVGIS typical year, with the engine's existing transposition onto the roof plane: tilt and azimuth are rows, with south at 35° as the default. Temperature losses and system losses are rows.
- **The check:** one call to PVGIS's PV calculator (`PVcalc`) for the same location and system gives an annual figure. The engine must be within 5% (an acceptance criterion).
- **Each hour,** generation is used in the house first: base load, then the heat pump. The rest is exported at the export rate. There is no battery in v1.
- **System size** is an uncertain row (default 4 kWp), constrained by the archetype's roof area.

### Costs, grants and payback

**Upfront costs** are uncertain rows with wide ranges:
- the air source heat pump installed (before grant);
- a like-for-like replacement gas boiler;
- PV, per kWp, from the DESNZ solar PV cost data.

**The grant:** the Boiler Upgrade Scheme gives £7,500 for an air source heat pump in England (checked on GOV.UK on 18 October 2026). It is a fixed row with a monthly cadence. The off-gas uplift is out of scope, because v1 homes have mains gas.

**Lifetimes:** the heat pump, the boiler and PV each have an uncertain lifetime row.

**Payback** is measured against the reference setup: the gas boiler with no solar, replaced like for like when it fails.
- extra upfront cost = (setup's upfront − grant) − replacement boiler cost;
- annual saving = the reference running cost − the setup's running cost, each year, under the price scenario;
- payback = the first year in which cumulative savings cover the extra upfront cost. If that doesn't happen within the setup's lifetime, the report says "doesn't pay back within its lifetime".

**The shared price scenario:** annual real price changes for gas and electricity are uncertain rows, sampled once per sample and shared by every setup, so the comparison stays paired. Prices then follow that path. Today's cap is year 1. Payback is undiscounted, and the report says so.

### Sampling, the report and speed

- **Paired sampling** extends to all setups and tariffs: one set of draws per sample, shared by every setup.
- **Correlated rows** are drawn from one shared uniform per cause: hot water use and internal gains (occupancy), and the two price changes, which are correlated, not identical.
- **The phase 2 report** covers the London 1930s semi in full: 4 setups × 3 tariffs at N=500, with a sensitivity table for each cost difference against the reference setup. It also has an archetype table at N=200, giving each archetype's central and P10–P90 results for the reference setup and for the heat pump on the cap, and its gap from NEED.
- **Speed:**
  - `npm run bench` keeps its phase 1 workload (500 samples × 2 setups, under 5 seconds) and adds a full report workload with a generous limit.
  - A separate check times one central run of all setups and tariffs (under 100 ms).
  - The thermal-mass step must stay allocation-free in the hourly loop, like the phase 1 loop.

### Data downloads

These are approved by Magnus in one go when implementation starts, and each is subject to the 14-day rule where it is a package:
- RdSAP 10 specification tables (BRE PDF, already cited)
- NEED 2026 tables by type and age (already downloaded once; refetched for the extra archetypes)
- Ofgem price cap regional rates (London) for the current quarter
- Octopus API: Cosy and Agile product and unit-rate endpoints for London, and an export tariff (no key needed; checked on 18 October 2026)
- PVGIS `PVcalc` for the reference PV system (one call)
- DESNZ solar PV cost data; BUS statistics for heat pump costs
- Electrification of Heat open-access daily performance data (SN 9210) or its published reports, for the COP check
- HeatpumpMonitor.org public summary statistics, for the "well-installed" option

### Register contents for phase 2 (summary)

New or changed rows, by section:
- **Archetypes:** `table` rows for the archetype facts; storey height and window area by age band.
- **Fabric:** U-value tables by age band × construction, and by quick-facts answer; thermal mass by construction.
- **Behaviour:** setpoint, schedules (gas and heat pump), boost size, and the occupancy relationships.
- **Heat pump:** curve parameters, the compensation curve, hot water flow temperature, the "well-installed" SPF, cylinder reheat windows.
- **Gas:** boiler auxiliary electricity.
- **Solar:** size, tilt, azimuth, losses.
- **Prices:** London cap rates, the Cosy and Agile series, the export rate, price changes.
- **Costs:** installed costs, the grant, lifetimes.

The phase 1 rows that become derived (element areas, volume) are removed. The parity test enforces it.

---

## Testing strategy

### Unit tests

**Coverage targets:** as phase 1.

**Physics checks (new):**
- Derived geometry reproduces hand calculations for two archetypes, and a mid-terrace has less exposed wall than an end-terrace of the same size.
- **Thermal mass:**
  - with C → 0, the node follows the steady-state result;
  - with continuous heating, it reproduces phase 1's annual space heat to within 1%;
  - with the heating off, the internal temperature decays towards outdoor exponentially with time constant C ÷ H.
- Energy balance holds every hour, and over the year.
- **COP curve:**
  - the solved k gives the sampled SPF to within 0.1% in every sample;
  - COP falls as outdoor temperature falls, and as flow temperature rises;
  - hot water COP is below space heating COP at the same hour.
- **Control:**
  - on a flat tariff, control rules change nothing;
  - on Cosy, a larger share of the heat pump's electricity falls in cheap periods than with control off;
  - comfort is never below the setpoint minus the coast amount during heating periods.
- PV is within 5% of the PVGIS `PVcalc` figure, and no house exports more than it generates.
- The payback worked example, done by hand in `REFERENCE/engine.md`, is reproduced exactly, including "doesn't pay back".
- The grant is applied to heat pump setups only.

**Register and sampling checks (new):**
- `table` rows validate: each key is unique, and every key the engine reads exists. An unknown key throws an error naming it.
- Correlated draws: the same seed gives the same correlated pair. Rows on one cause move together, and rows on different causes stay independent.
- Every setup in a sample sees the same draws (pairing holds across all four setups and three tariffs).

**HEM check (engine test):** the 1930s semi under the HEM schedule is within 10% of the pre-registered HEM run.

### Integration tests
- [ ] The phase 2 report regenerates offline and byte-identically, and CI checks it for drift. The phase 1 report stays as a historical file and is no longer regenerated; CI drops it from the drift check.

### Performance check
- [ ] The bench workloads and the 100 ms single-run check, as above.

### Manual checklist
- [ ] Magnus reads the phase 2 report.

---

## Pre-commit checklist

- [ ] Tests pass, type checking and lint pass, and coverage meets targets.
- [ ] `npm run report` regenerates with no diff.
- [ ] The docs are updated: `REFERENCE/engine.md`, `REFERENCE/register.md`, the indexes and root `CLAUDE.md`.
- [ ] There is no debug output and there are no secrets.

---

## PR workflow

Each PR leaves something useful on its own:
1. `feature/phase-2-archetypes`: the `table` row kind and its ADR, derived geometry, the curated archetypes, quick facts, the RdSAP tables checked (closes #7, #9), and a first archetype table against NEED on the existing continuous-heating engine.
2. `feature/phase-2-heating-schedules`: the comparison rules committed first, then thermal mass, schedules, the HEM run and decision, and the recalibration and its ADR (closes #13; evidence on #14 and #15).
3. `feature/phase-2-heat-pump-curve`: the COP curve and its ADR, flow temperatures, cylinder reheat, the "well-installed" option, and boiler auxiliary electricity (closes #18).
4. `feature/phase-2-tariffs`: London cap rates, the Octopus snapshot, the export rate, and the control rules and their ADR.
5. `feature/phase-2-solar`: PV generation, the `PVcalc` check, self-consumption and export.
6. `feature/phase-2-costs-payback`: costs, the grant, lifetimes, the price scenario and payback.
7. `feature/phase-2-report`: correlated sampling (closes #20), the phase 2 report, the archetype table, the bench workloads and the CI drift switch.

Run `/review-pr` on each.

---

## Edge cases and considerations

### Known risks
- **HEM under a schedule may disagree more than under continuous heating.** Mitigation: pre-registered rules and the decision rule, as in phase 1.
- **Recalibration may land the setpoint at an implausible value.** If the solved setpoint falls outside 16–21 °C, stop and review with Magnus, and don't force a fit.
- **Agile's last 12 months may be unusual** (for example, a winter price spike). The report says which 12 months were used.
- **Cosy's periods or rates may change during the phase.** The snapshot is dated and the row has a cadence; the report shows the date.
- **Speed:** 12 setup-tariff combinations per sample are about six times phase 1's work. The single-run target and an allocation-free loop are the guard.
- **Neutrality:** the heat pump schedule, boost and "well-installed" option could tilt results. Each is a sourced or clearly approximate row, shown in the sensitivity table, and never tuned to a desired answer.

### Security
- As phase 1: no server, no user data, no secrets. The Octopus endpoints used need no key.

---

## Technical debt

Closed by this phase: [#7](https://github.com/mannepanne/energy-sim/issues/7), [#9](https://github.com/mannepanne/energy-sim/issues/9), [#13](https://github.com/mannepanne/energy-sim/issues/13), [#18](https://github.com/mannepanne/energy-sim/issues/18) and [#20](https://github.com/mannepanne/energy-sim/issues/20).

Carried forward:
- [#8](https://github.com/mannepanne/energy-sim/issues/8): verify the 2026 gas carbon factor. It is quick and should be done in the tariffs PR if the DESNZ file is available.
- [#14](https://github.com/mannepanne/energy-sim/issues/14): fabric error versus behaviour. Phase 2 adds the archetype gaps as evidence; fixing it needs homes with known fabric.
- [#15](https://github.com/mannepanne/energy-sim/issues/15): heat pump household behaviour. Phase 2 adds a separate schedule row; it closes when that row has a source.
- [#16](https://github.com/mannepanne/energy-sim/issues/16): fixed weather. Phase 2 adds a price scenario, but one weather year remains.
- [#17](https://github.com/mannepanne/energy-sim/issues/17): annual grid carbon factor.

New, tracked when their code lands: unlimited heat pump capacity and no backup heat; one location; undiscounted payback; Agile represented by a past year.

---

## Related documentation

- [Project outline](./ORIGINAL_IDEA/project-outline.md) and [model and register spec](./ORIGINAL_IDEA/home-energy-simulator-spec.md)
- [Phase 1 spec (archived)](./ARCHIVE/01-engine-core.md), [engine.md](../REFERENCE/engine.md) and [register.md](../REFERENCE/register.md)
- [ADR: client-side, build-time snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md)
- [ADR: typed parameter register](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md)
- [ADR: calibration to NEED](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md)
