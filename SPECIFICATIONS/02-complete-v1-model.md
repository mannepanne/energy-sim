# Phase 2: complete v1 model

## Phase overview

**Phase number:** 2
**Phase name:** Complete v1 model (headless)
**Estimated timeframe:** 10–14 weeks of side-project time. Sourcing register values and building the data snapshots are the long poles.
**Dependencies:** Phase 1 (complete). Phase 1's engine, register, sampling and report are extended. The comparison layer, which is hard-wired to two setups, is rewritten.

**Brief description:**
Phase 2 turns the one-house engine into the model v1 needs:
- **Many houses:** a curated set of house types, adjusted by quick facts.
- **Four setups:** gas boiler or air source heat pump, each with or without roof solar.
- **Tariffs:** the price cap and two Octopus time-of-use tariffs.
- **Results:** running cost, carbon, upfront cost after grants and payback, all as honest ranges.

For time-of-use tariffs to mean anything, the engine has to know *when* the house is heated. So phase 2 adds thermal mass and heating schedules, and checks them against HEM before relying on them. There is still no user interface (phase 3), and London is still the only location.

**Decisions Magnus made on 18 October 2026:**
- trim phase 2 to the v1 feature list in the [project outline](./ORIGINAL_IDEA/project-outline.md);
- add heating schedules with thermal mass, made lower-risk by putting the flat-tariff work first and agreeing a fallback in advance;
- use a heat pump efficiency curve tied to the field-measured SPF;
- use a curated set of house types;
- keep Octopus Agile, and state its limitations.

Background: [project-outline.md](./ORIGINAL_IDEA/project-outline.md) and [home-energy-simulator-spec.md](./ORIGINAL_IDEA/home-energy-simulator-spec.md).
Phase 1: the [archived spec](./ARCHIVE/01-engine-core.md), [engine.md](../REFERENCE/engine.md) and [register.md](../REFERENCE/register.md).
Decisions: the [client-side snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md), [typed register](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md) and [calibration](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md) ADRs.

---

## Scope and deliverables

### In scope
- [ ] **House types:** about ten archetypes, each keyed to one RdSAP age band, with floor area as an input. The engine derives geometry from a few facts about each archetype. See "House types and geometry".
- [ ] **Quick facts:** loft insulation, wall insulation, glazing and occupants. A table maps each answer to register values, so no answer needs code. See "Quick facts".
- [ ] **Hourly heat pump behaviour:**
  - a COP curve against outdoor and flow temperature, scaled so the year's result equals the sampled SPF;
  - hot water at its own, higher flow temperature;
  - a "well-installed" SPF scenario.

  See "The heat pump over the year".
- [ ] **Solar PV:** hourly generation from the PVGIS weather, used in the house first and the rest exported, checked against PVGIS's own PV calculator. See "Solar PV".
- [ ] **Capital costs, grants and payback:**
  - installed costs and lifetimes;
  - the Boiler Upgrade Scheme grant;
  - payback against replacing the boiler like for like, under a shared price scenario;
  - solar's own payback reported separately.

  See "Costs, grants and payback".
- [ ] **Thermal mass and heating schedules:**
  - a single thermal-mass node, a heating output cap and heating periods with a setpoint, in place of continuous heating to one mean temperature;
  - a check against HEM under the same schedule, with the rules committed before the run;
  - behaviour rows recalibrated to NEED.

  See "Heating over time".
- [ ] **Tariffs:**
  - the London region's price cap, replacing the GB average;
  - Octopus Cosy, for heat pump setups only;
  - Octopus Agile, from the last 12 months of actual rates;
  - a flat export rate.

  A calendar module handles weekdays, clock changes and half-hours. Simple, published rules move heat pump and cylinder running into cheap periods. See "Time base" and "Tariffs and control".
- [ ] **Base electricity by hour of day**, needed for time-of-use costs and solar self-consumption.
- [ ] **Boiler auxiliary electricity** for the gas setups, which closes [#18](https://github.com/mannepanne/energy-sim/issues/18).
- [ ] **Correlated sampling**, with a Gaussian copula and sourced or approximate correlation rows. This closes [#20](https://github.com/mannepanne/energy-sim/issues/20).
- [ ] **A sourced heat pump heating schedule** (longer, lower heating), so the behaviour bias in [#15](https://github.com/mannepanne/energy-sim/issues/15) is either fixed or stated prominently. See "Heating over time".
- [ ] **The phase 2 report**, `reports/phase-2-v1-model.md`. It is committed and checked for drift in CI. See "Sampling, the report and speed".
- [ ] **The ADRs** listed under "Architecture decisions".
- [ ] **Tests**, plus updates to `REFERENCE/engine.md`, `REFERENCE/register.md` and the troubleshooting guide.

### Out of scope (later phases or deferred)
- Any user interface, and user overrides through it (phase 3). The phase 3 notes in [SPECIFICATIONS/CLAUDE.md](./CLAUDE.md) still apply.
- Weather variation between years. One PVGIS typical year stays.
- An hourly grid-carbon profile. The annual factor stays ([#17](https://github.com/mannepanne/energy-sim/issues/17) carries forward).
- Heat pump sizing studies and backup heating. The output cap below is a simple limit, not a sizing method.
- Locations other than London, and regional rates other than London's.
- Insulation and glazing upgrades as comparable options. Quick facts describe the house as it is.
- Home batteries, EVs, hybrid heat pumps, and calibration from a user's bills.
- A question about the current boiler's age. v1 assumes the boiler needs replacing now, and the report says so. A boiler-age answer is a phase 3 option.

### Acceptance criteria
- [ ] **Geometry:**
  - two archetypes' derived geometry matches hand calculations documented in `REFERENCE/engine.md`;
  - the RdSAP rows are checked line by line (closes [#9](https://github.com/mannepanne/energy-sim/issues/9));
  - the ground floor U-value uses the RdSAP method (closes [#7](https://github.com/mannepanne/energy-sim/issues/7)).
- [ ] **Archetype gaps:** every archetype's gap from its pre-registered NEED readings is reported. A gap above the pre-registered threshold flags the archetype in the report. See "House types and geometry".
- [ ] **COP curve:** on the reference run (price cap, no control), the year's COP gives the sampled SPF to within 0.1% in every sample.
- [ ] **PV:** the reference system is within the pre-registered tolerance of PVGIS's calculator (see "Solar PV").
- [ ] **HEM under a schedule:** the thermal-mass engine is checked against HEM using the same schedule and pre-registered rules, and the decision rule is applied and recorded.
- [ ] **Recalibration:** the behaviour rows are recalibrated so the 1930s semi's central gas use hits the target fixed in this spec.
- [ ] **Report:** `npm run report` regenerates the phase 2 report offline and byte-identically, and CI checks it for drift. Its contents are listed under "Sampling, the report and speed".
- [ ] **Speed:**
  - one central run of one house, with all setup and tariff combinations, takes under 100 ms on the bench machine;
  - the full report builds in CI in under 60 seconds.
- [ ] **Technical debt:** every open `technical-debt` issue is either closed by this phase or carried forward by number in "Technical debt".
- [ ] **Quality:** tests pass, with coverage at 95% or above for lines, functions and statements and 90% or above for branches; type checking and lint pass; CI is green.

Validation against real homes and expert review stay after the beta launch, and don't gate this phase.

---

## Technical approach

### Architecture decisions

These need ADRs, which Magnus confirms, before the PR that relies on them is merged.

1. **Archetype tables, categorical values and derived geometry.** This amends the [typed register ADR](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md).
   - **A new row kind, `table`,** holds values keyed by archetype, RdSAP age band, construction or a quick-facts answer.
   - **Keys are strings, and a cell may be fixed or uncertain.** An uncertain cell is sampled with the hash key `rowId|key`, so adding cells never moves other draws.
   - **Categorical facts** (house type, construction) are allowed as string values in table cells.
   - **Element areas and volume move out of the register.** The engine derives them from floor area, storeys, house type and footprint shape. This also settles the phase 3 question about overriding rows that others depend on.
   - **Schema additions:**
     - new sections: archetypes, solar, costs and tariffs;
     - a weekly profile resolution (`hour-of-week`, 168 values);
     - snapshot schemas for each new data file;
     - the parity test and throwing accessor extended to table keys.
2. **Heating schedules with one thermal-mass node and an output cap.** This supersedes part of the [calibration ADR](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md).
   - The engine heats to a setpoint during heating periods, up to a capped output, and lets the house cool against its thermal mass outside them.
   - The calibrated behaviour moves from a continuous mean temperature to the setpoint.
   - The fallback if HEM disagrees by 15–30% is agreed now: a two-node model (air and mass, as in ISO 13790's 5R1C).
3. **A heat pump COP curve anchored on the field SPF.** The curve's shape sets *when* electricity is used. A scale factor k, solved once per sample on a reference run, sets *how much*. Control and tariffs then change efficiency through the curve, not through k. So control that runs the heat pump in cold hours pays for it, and a brochure figure can never make the model optimistic.
4. **Rule-based tariff control.** Fixed, published rules move heat pump and cylinder running into cheap periods. There is no optimiser, so results are explainable and fast.
5. **The time base.** Engine hours are UTC. Schedules and tariffs are defined in UK local time and converted by a calendar module (see "Time base").

The engine stays a pure library, and data stays build-time snapshots. The report's seed, sample count and list of setups and tariffs are method settings in code, as the amended register ADR allows.

### House types and geometry

**Each archetype is keyed to one RdSAP age band**, and its NEED readings are fixed in the first PR, before any gap is computed. The proposed set:

| Archetype | RdSAP band | NEED age band |
| --- | --- | --- |
| Mid-terrace, solid brick | A (before 1900) | Pre 1919 |
| End-terrace, solid brick | A (before 1900) | Pre 1919 |
| Semi-detached, cavity (the phase 1 house) | C (1930–49) | 1919–1944 (as phase 1) |
| Semi-detached, cavity | D (1950–66) | 1945–1964 |
| Bungalow, cavity | D (1950–66) | 1945–1964 |
| Mid-terrace, cavity | E (1967–75) | 1965–1982 |
| Detached, cavity | F (1976–82) | 1965–1982 |
| Detached, cavity, insulated as built | G (1983–90) | 1983–1992 |
| Semi-detached, insulated as built | K (2007–11) | 2000–2011 (NEED's nearest band; it also covers RdSAP J, 2003–06) |
| Mid-terrace, insulated as built | L (2012–21) | 2012 onwards |

A purpose-built flat is out of scope, because it has no roof or ground floor of its own and needs different geometry.

**The NEED readings for each archetype:**
- **Reading T (by type):** the 2024 London median for the archetype's type, NEED age band and default bedroom count. This is how phase 1's reading C was built.
- **Reading S (by size):** the England and Wales per-m² median for the NEED age band × the default floor area. This is how phase 1's reading A was built.

**The pre-registered rule:** an archetype is **flagged** in the report if its central gas use lies more than 25% outside the interval between its two readings. A flagged archetype stays in the report with a visible warning. It is not dropped, because the beta launch shows proof of concept, and the warning is the honest output.

**Each archetype is a few facts:**
- type, RdSAP band, storeys, wall construction;
- default floor area and bedrooms, from NEED or EPC data for the type and band;
- footprint aspect ratio and number of party walls.

Floor area and bedrooms are fixed inputs for a run, not sampled.

**Derived geometry** (engine code, tested):
- footprint = floor area ÷ storeys; width and depth from the aspect ratio;
- exposed perimeter = footprint perimeter minus party wall lengths;
- wall area = exposed perimeter × storey height × storeys, minus windows and doors;
- window area from the RdSAP formula for the age band; door area fixed;
- roof and ground floor = footprint;
- heated volume = floor area × storey height.

**Fabric** comes from the RdSAP 10 England tables, keyed by age band and construction, pulled into `table` rows and checked line by line (closes #9). The ground floor U-value is computed in the engine with the RdSAP / BS EN ISO 13370 method, from perimeter and area (closes #7).

**PR 1 recalibrates on the continuous engine.** Derived geometry and the new floor U-value move gas use, so the phase 1 mean internal temperature is re-solved with the phase 1 method, and the drift test is updated. PR 5 then replaces this with the schedule calibration.

### Quick facts

Each answer selects register values through a `table` row:
- **Loft insulation:** none, about 100 mm, or 270 mm or more → roof U-value.
- **Walls:** as built, cavity filled, or solid wall insulated → wall U-value. Only answers that fit the archetype's construction are offered.
- **Glazing:** single, older double, or newer double or triple → window U-value and g-value.
- **Occupants:** 1–5 → hot water litres a day and internal gains.
  - The occupant count is a fixed input. What is sampled is the uncertain **per-occupant** terms: litres per person, and gains per person on top of a floor-area term.
  - Each archetype's default occupant count comes from SAP's occupancy formula for its floor area, rounded.

Each archetype's default answers are the most common ones for its age band, stated in the row's rationale.

### The heat pump over the year

**The COP curve.** Each hour:

```latex
COP(t) = k \cdot \frac{T_{flow}(t) + 273.15}{T_{flow}(t) - T_{out}(t) + \Delta T_{lift}}
```

- **The shape** is Carnot-like. It is clamped to a floor and a ceiling (rows) **before** scaling, so k stays a closed-form solve. The clamp guards the hours when T_out nears T_flow.
- **A physical ceiling** (a row, around 7) also applies to the scaled COP. If it binds in any hour, k is solved iteratively instead, so the year still matches the SPF. The report counts the samples in which it bound.
- **T_flow:**
  - for space heating, a weather-compensation line from T_out, with its endpoints as rows (the flow temperature at design and at mild conditions is uncertain);
  - for hot water, a fixed, higher value.
- **The k solve:**
  - k is solved **once per sample** on the reference run: price cap, no control, and the gas setups' heating pattern (continuous heating until PR 5, then the gas schedule);
  - on that run, total heat (space and hot water) ÷ total electricity equals the sampled SPF exactly;
  - the same k is reused on every tariff and with control, so moving running into colder or hotter hours changes efficiency through the curve.
- **The cross-check:** the curve's shape and the compensation line are compared with the Electrification of Heat trial's published performance by outdoor temperature. This is a check, not a fit.
  - The trial's open daily dataset (SN 9210) may need UK Data Service registration. If it does, Magnus downloads it into `REFERENCE/data-downloads/` (gitignored), and it stays local and uncommitted. The trial's published reports are the fallback.

**The "well-installed" scenario** swaps the SPF distribution for one anchored on HeatpumpMonitor.org. It appears in the report as a labelled scenario, not a fifth setup. The report says that sample is self-selected.

**The cylinder** (heat pump setups) has a stored-heat state:
- volume, setpoint and minimum temperature are rows;
- hot water is drawn on an hourly draw profile (a `profile` row);
- standing loss continues as in phase 1;
- the cylinder is reheated when it falls below its minimum, or in the scheduled and cheap windows under control.

It can't run out, because a reheat is forced at the minimum. No immersion backup is modelled. The gas setups stay combi boilers with no store.

**Boiler auxiliary electricity** (pump and fan) for the gas setups is a row in kWh a year, spread over the hours the boiler fires (closes #18).

**Output cap.** Each setup's heat output is capped. For the heat pump, the cap is the design heat loss at the London design temperature × a margin row. For the gas boiler, it is a rated output row. The cap applies from PR 5, when intermittent heating can ask for more than the steady load.

### Solar PV

- **Generation:**
  - uses the engine's existing transposition onto the roof plane;
  - tilt (default 35°) is a row. Azimuth is an uncertain row (default south, range south-east to south-west), so the sensitivity table shows how much roof direction matters;
  - temperature losses use the snapshot's air temperature and a fixed coefficient row; system losses are a row.
- **Size:**
  - an uncertain row, with a default of 4 kWp;
  - clipped to the archetype's maximum: footprint ÷ cos(pitch) × ½ (one roof slope) × a usable fraction row × kWp per m² row.
- **Use each hour:** generation meets base load, then the heat pump or the boiler's auxiliary load, then the cylinder under control. The rest is exported.
- **Carbon:** carbon counts imported electricity and gas only. Exported kWh are reported, but earn no carbon credit. The report states this convention.
- **The check:**
  - one call to PVGIS's PV calculator (`PVcalc`) for the same location and system gives an annual figure;
  - `PVcalc` averages many years and uses a non-isotropic sky and a wind-driven temperature model, so the pre-registered tolerance is **8%**;
  - the PR records the breakdown of the gap. If PVGIS's `seriescalc` endpoint can return the typical year directly, the tolerance tightens to 5%.

### Costs, grants and payback

**What each setup costs up front** (every cost is an uncertain row with a wide range):

| Setup | Upfront components |
| --- | --- |
| Gas boiler, no solar (the reference) | Replacement combi boiler |
| Gas boiler with solar | Replacement combi boiler + PV system |
| Heat pump, no solar | Heat pump installed, including the cylinder and typical radiator changes − the grant |
| Heat pump with solar | Heat pump installed − the grant + PV system |

**The grant:** the Boiler Upgrade Scheme gives £7,500 for an air source heat pump in England, checked on GOV.UK on 18 October 2026.
- It is a fixed row with a monthly cadence.
- The off-gas uplift doesn't apply, because v1 homes have mains gas.
- The costs PR checks and states the remaining eligibility conditions. MCS certification is assumed for the heat pump and for PV export payments, and the report says so.

**Lifetimes** are uncertain rows for the heat pump, the boiler and PV.

**Payback horizon and replacements:**
- the horizon for a heat pump setup, with or without solar, is the heat pump's lifetime. Any PV value left at the end is ignored, and the report says so;
- for gas with solar, it is the PV lifetime;
- the reference boiler is replaced again whenever its lifetime ends inside the horizon, and that cost counts against the reference;
- a gas setup's own boiler follows the same rule.

**Payback** is calculated for each sample:
- extra upfront = setup upfront − reference upfront;
- each year's saving = reference running cost − setup running cost, under the price scenario;
- payback = the first year in which cumulative savings, less any extra replacement costs, cover the extra upfront;
- if extra upfront ≤ 0, payback is year 0;
- if it never pays back within the horizon, including when savings are negative, the sample is "doesn't pay back".

**The summary:**
- the share of samples that pay back within the horizon;
- the median and P10–P90, with "doesn't pay back" ranked as later than every year;
- percentiles that fall on such samples are shown as "beyond lifetime".

**Solar's own payback** is also reported on each heating setup, so solar can't hide a heat pump that doesn't pay back.

**The price scenario:**
- annual real price changes for gas and electricity are uncertain rows;
- they are drawn once per sample and shared by every setup;
- each fuel's change scales its unit rates and standing charges;
- the export rate follows electricity;
- Cosy and Agile keep their shape relative to the cap;
- today's rates are year 1;
- payback is undiscounted, and the report says so.

The two price changes are correlated through the copula (see "Sampling, the report and speed").

### Heating over time

**One thermal-mass node.** Each hour:

```latex
C \frac{dT_{in}}{dt} = Q_{heat}(t) + G_{solar}(t) + G_{internal}(t) - H\,\big(T_{in}(t) - T_{out}(t)\big)
```

- **C is the effective heat capacity.** It comes from SAP's thermal mass parameter for the construction (a `table` row) × floor area.
- **The solve:** an implicit (backward Euler) hourly step, which is stable at every C.
- **During heating periods,** heat is supplied to reach the setpoint, up to the output cap.
- **Outside heating periods,** the house cools freely. There is no cooling, and T_in may rise above the setpoint on warm days.

**Schedules** are `profile` rows at `hour-of-week` resolution:
- **Gas setups:** SAP's pattern, which is weekdays 07:00–09:00 and 16:00–23:00, and weekends 07:00–23:00.
- **Heat pump setups:** a separate row for longer, lower heating, the usual way heat pumps are run.
  - **Sourcing it is a phase 2 deliverable:** the Electrification of Heat trial's reports or data (heating hours, internal temperatures) or HeatpumpMonitor.org.
  - If no source is found by the report PR, the row equals the gas schedule, and the report states the issue 15 bias in its headline.
  - Either way, the sensitivity table shows the effect.
  - Neutrality: the row is never tuned to favour either setup.

**Benchmark first, as in phase 1:**
1. **Commit the comparison rules before running:**
   - the HEM output (zone space heat demand);
   - the schedule, in HEM's `SetpointTimeControl` with weekday and weekend blocks, which the pinned HEM commit supports and its examples use;
   - the setpoint;
   - how C maps to HEM's element heat capacities;
   - the matched air temperature;
   - the tolerance.
2. Run HEM on the 1930s semi with the same schedule.
3. **Apply the decision rule:**
   - **within 15%:** proceed;
   - **15–30%:** build the two-node fallback, then rerun;
   - **above 30%:** stop and revisit with Magnus.
4. The engine test then guards a tighter 10% against regressions.

**Recalibration**, once the benchmark passes:
- **The target is fixed now:** the 1930s semi's central gas use = 13,200 kWh, the phase 1 target.
- The setpoint is the calibrated row. Its range comes from phase 1's NEED readings A and C for the 1930s semi (not this phase's per-archetype readings T and S).
- The schedule stays at its sourced default and is not fitted.
- If the solved setpoint falls outside 16–21 °C, stop and review with Magnus rather than force a fit.
- `scripts/calibration/` re-solves the setpoint, and a drift test on the setpoint replaces the phase 1 test on the mean internal temperature.
- `heating.meanInternalTemperature` is removed. The parity test enforces this.
- The other archetypes use the same behaviour rows. Their gaps from NEED are the evidence on [#14](https://github.com/mannepanne/energy-sim/issues/14).

### Time base

- **Engine hours** are UTC hours 0–8759 of the PVGIS typical year.
- **Day of the week:** the typical year's months come from different years, so weekdays are taken from the reference year (a method setting): 1 January is a Thursday, as in 2026, and the days follow on from there, so the clock changes fall on Sundays. The report states this (Magnus, 19 October 2026; see the time-base ADR).
- **Local time:** schedules and tariff periods are in UK local time. The calendar module converts them to UTC hours using the UK clock-change rule (last Sunday in March and in October), applied to a reference year (2026). Cosy's periods stay fixed in local time across clock changes.
- **Agile:**
  - the last full 12 months of half-hourly London rates are mapped onto the typical year by calendar date (month and day), with 29 February dropped;
  - each UTC hour's rate is the mean of its two half-hours;
  - weekday mismatches from this mapping are accepted and stated.
- **Hourly profiles** (base electricity, hot water draw-off) use local hour of day and are converted in the same way.

### Tariffs and control

**Which setups run on which tariff:**

| Tariff | Gas setups | Heat pump setups |
| --- | --- | --- |
| Price cap (London region) | Yes | Yes |
| Octopus Agile | Yes (electricity only) | Yes |
| Octopus Cosy | No (sold only to homes with a heat pump or electric heating) | Yes |

That gives 10 combinations: 2 gas setups × 2 tariffs, plus 2 heat pump setups × 3 tariffs. Gas fuel is always on the price cap; a gas home's electricity may be on the cap or Agile.

**Price rows for each tariff:**
- unit rates and standing charges, including VAT (the Octopus API's inc-VAT values);
- negative Agile prices are passed through, so the house is paid to import;
- one flat export rate (Octopus Outgoing Fixed, checked when the snapshot is built) applies to every solar setup;
- each tariff has its `lastChecked`, cadence and `validUntil`.

**Control rules for the heat pump setups.** These are the same for every tariff, and published in `REFERENCE/engine.md`:
- **Cheap and peak:**
  - on Cosy, these are its published cheap and peak periods;
  - on Agile, "cheap" is the cheapest quarter of each day's hours and "peak" the dearest quarter, with the quarter as a row. A "day" runs from midnight to midnight, UK local time.
- **Preheat:** in cheap hours during a heating period, or up to 3 hours before one, the setpoint is raised by a boost row (uncertain, around 1–2 K). The comfort cap is setpoint + boost.
- **Coast:** in peak hours during a heating period, the setpoint is lowered by the same boost. This is never below setpoint − boost.
- **Cylinder:** under control, the cylinder is reheated in the cheapest hours that keep it above its minimum before each scheduled draw-off.
- **On the price cap,** the rules change nothing.

**Agile's limitations, stated in the report:**
- which 12 months were used;
- that a past year is not a forecast;
- that the past year's prices are paired with typical-year weather. This loses the link between price spikes and cold, still days, and likely flatters the heat pump on Agile;
- that control knows each day's prices in advance. Octopus publishes them the day before, so this is realistic for a smart controller, but it favours the heat pump over a household that doesn't respond.

### Sampling, the report and speed

**Sampling:**
- **Pairing:** one set of draws per sample, shared by every setup and tariff.
- **Correlated rows:** a Gaussian copula, with each correlation coefficient as a row (approximate, with a rationale where no source exists). The pairs are:
  - the per-occupant hot water and gains terms;
  - the gas and electricity price changes, which are correlated, not identical.

  Every other row stays independent, as now.
- **Sensitivity:** each row is moved alone, ignoring correlations, which the report states. The swing is measured on each setup's cost difference against the reference.

**The comparison layer** is rewritten for N setups against a reference:
- paired differences against the reference;
- the share of samples in which each combination is cheapest, both within each tariff and across all 10 combinations, with ties split equally;
- payback summaries.

**The report** (`reports/phase-2-v1-model.md`):
- **The London 1930s semi in full,** at N=500. For each of the 10 combinations, it shows running cost, carbon, upfront cost after the grant and payback, each as central, median and P10–P90. It also shows the paired differences, the shares cheapest, solar's own payback, the sensitivity table, and the well-installed scenario.
- **The archetype table,** at N=200. It covers the reference setup and the heat pump on the cap, showing central and P10–P90 results, the two NEED readings, the gap and the flag.
- **The checks:** HEM (continuous and scheduled) and PV.
- **The data dates, the conventions** (time base, carbon, undiscounted payback, a boiler needing replacement now) **and the limitations.**

The phase 1 report stays as a historical file. It is no longer regenerated, and CI's drift check moves to the phase 2 report.

**Speed:**
- **The single run** of one central house across all 10 combinations must take under 100 ms. That is about four thermal passes, because heat demand doesn't depend on solar and gas heat doesn't depend on tariff.
- **`npm run bench`** keeps its phase 1 workload (under 5 seconds) and adds the full report workload (under 60 seconds in CI).
- **The bench machine** is the GitHub Actions `ubuntu-latest` runner, and timings are logged.
- **The hourly loop** stays allocation-free.
- **Phase 3 assumption:** interactivity uses central runs, and ranges are computed with fewer samples in a web worker. Phase 3 decides the details.

### Data downloads

Magnus approves these in one go when implementation starts. Packages follow the [14-day rule](../REFERENCE/decisions/2026-10-18-fourteen-day-dependency-wait.md).
- **RdSAP 10 specification tables** (BRE PDF, already cited).
- **NEED 2026 tables** by type, age and bedrooms (refetched for the extra archetypes).
- **Ofgem price cap** regional rates (London) for the current quarter.
- **Octopus API** (no key needed; checked on 18 October 2026): Cosy and Agile product and unit-rate endpoints for London, and Outgoing Fixed. Agile is paginated and may span two product codes over 12 months.
- **PVGIS:** `PVcalc` for the reference system, and `seriescalc` if it can return the typical year.
- **DESNZ solar PV cost data,** and Boiler Upgrade Scheme statistics for heat pump costs.
- **Electrification of Heat** daily data (SN 9210) or its reports (see "The heat pump over the year").
- **HeatpumpMonitor.org** public summary statistics.

### Register contents for phase 2 (summary)

New or changed rows, by section:
- **Archetypes:** archetype facts; storey height and window formula by age band.
- **Fabric:** U-value tables by age band × construction and by quick-facts answer; thermal mass by construction.
- **Behaviour:**
  - setpoint; gas and heat pump schedules; boost;
  - per-occupant hot water and gains;
  - the hourly base electricity profile (from Elexon profile class 1, or approximate);
  - the hot water draw-off profile.
- **Heat pump:** curve parameters and clamps; compensation endpoints; hot water flow temperature; the well-installed SPF; cylinder volume, setpoint and minimum; output cap margin and design temperature.
- **Gas:** boiler rated output; auxiliary electricity.
- **Solar:** size, tilt, azimuth, losses, temperature coefficient, usable roof fraction, kWp per m².
- **Prices:** London cap rates; Cosy and Agile series and standing charges; export rate; price changes and their correlation.
- **Costs:** installed costs; the grant; lifetimes.

Rows that become derived are removed: element areas, volume and `heating.meanInternalTemperature`. The parity test enforces this.

---

## Testing strategy

### Unit tests

**Coverage targets:** as phase 1.

**Physics checks (new):**
- Derived geometry matches hand calculations for two archetypes. A mid-terrace has less exposed wall than an end-terrace of the same size.
- **Thermal mass:**
  - with continuous heating and C → 0, the node reproduces phase 1's annual space heat to within 0.5%;
  - with continuous heating and full C, it stays within 5% (mass stores shoulder-season surplus that phase 1 discarded);
  - with heating off, the temperature decays towards outdoor with time constant C ÷ H. For time constants of 10 hours or more, which covers every archetype, it is within 2% of the exact exponential at an hourly backward-Euler step;
  - the energy balance holds every hour and over the year;
  - the output cap is never exceeded.
- **COP curve:**
  - on the reference run, k gives the sampled SPF to within 0.1% in every sample;
  - COP falls as outdoor temperature falls and as flow temperature rises;
  - the shape stays within its clamps, and the scaled COP never exceeds its physical ceiling;
  - hot water COP is below space heating COP in the same hour;
  - control that shifts running into colder hours lowers the year's efficiency.
- **Control:**
  - on the price cap, control changes nothing;
  - on Cosy, a larger share of heat pump electricity falls in cheap periods than with control off;
  - during heating periods, the temperature never falls below setpoint − boost.
- **Cylinder:** it never falls below its minimum at a draw-off hour, and its energy balance closes over the year.
- **Time base:**
  - clock changes move local-time periods by one UTC hour on the right dates;
  - a 24-hour local schedule covers exactly 24 UTC hours every day;
  - Agile half-hours average correctly.
- **PV:** within the pre-registered tolerance of `PVcalc`. Exports never exceed generation, and size never exceeds the roof maximum.
- **Payback:** a hand-worked example in `REFERENCE/engine.md` is reproduced exactly. It covers normal payback, year 0 (negative extra upfront), "doesn't pay back" (negative saving) and a reference boiler replacement inside the horizon.
- **Grant:** applied to heat pump setups only.

**Register and sampling checks (new):**
- **`table` rows:** keys are unique; every key the engine reads exists; an unknown key throws an error naming it; uncertain cells are sampled under `rowId|key`.
- **Copula:**
  - the same seed gives the same correlated draws;
  - the sample correlation matches each correlation row to within 0.05 over 100,000 draws;
  - uncorrelated rows stay independent.
- **Pairing:** it holds across all 10 combinations.

**HEM checks (engine tests):** the continuous check from phase 1 (re-pinned after PR 1's geometry change), and the scheduled check within 10% of the pre-registered HEM run.

### Integration tests
- [ ] The phase 2 report regenerates offline and byte-identically, and CI checks it for drift.

### Performance check
- [ ] The bench workloads and the 100 ms single-run check, as above.

### Tests that are rewritten, not extended
`geometry.test.ts`, `simulate.test.ts`, `compare.test.ts`, `sensitivity.test.ts`, the fixture register, the HEM check fixture, the calibration test and `scripts/report/build.test.ts`.

### Manual checklist
- [ ] Magnus reads the phase 2 report.

---

## Pre-commit checklist

- [ ] Tests pass, type checking and lint pass, and coverage meets targets.
- [ ] `npm run report` regenerates with no diff.
- [ ] The docs are updated: `REFERENCE/engine.md`, `REFERENCE/register.md`, the troubleshooting guide, the indexes and root `CLAUDE.md`.
- [ ] There is no debug output and there are no secrets.

---

## PR workflow

The flat-tariff work comes first, so a failed HEM check under a schedule still leaves a launchable v1 on the price cap.

1. `feature/phase-2-archetypes`:
   - the register schema changes and the archetypes ADR;
   - the calendar module and its time-base ADR, so every later hourly profile uses local time from the start;
   - the Gaussian copula (closes #20), so later PRs' ranges don't shift when it lands;
   - derived geometry, the archetypes and quick facts;
   - the RdSAP tables (closes #7 and #9);
   - the pre-registered NEED readings and flag rule;
   - the continuous-engine recalibration;
   - a first archetype table.
2. `feature/phase-2-heat-pump-curve`:
   - the COP curve and its ADR, flow temperatures and the k solve on the price cap;
   - the well-installed scenario;
   - the cylinder state;
   - boiler auxiliary electricity (closes #18).
3. `feature/phase-2-solar`: PV generation, the roof maximum, the PVGIS check, self-consumption and export, and the hourly base electricity profile.
4. `feature/phase-2-costs-payback`:
   - costs, the grant and its conditions, and lifetimes;
   - the price scenario and payback;
   - solar's own payback;
   - the comparison layer for N setups.
5. `feature/phase-2-heating-schedules`:
   - the comparison rules committed first;
   - thermal mass, schedules and the output cap;
   - the HEM run and decision;
   - the recalibration and its ADR, with the sourced heat pump schedule (closes #13, with evidence on #14 and #15).
6. `feature/phase-2-tariffs`: London cap rates, the Octopus snapshots (Cosy, Agile, export), and the control rules and their ADR.
7. `feature/phase-2-report`: the phase 2 report, the archetype table, the bench workloads and the CI drift switch.

Until PR 5 lands, the engine heats continuously, as in phase 1. PRs 2–4 are built and tested on that, and their numbers shift once when schedules arrive. The report is only generated in PR 7.

Run `/review-pr` on each.

**Fallbacks agreed in advance** (Magnus, 18 October 2026):
- **If the scheduled HEM check is above 30% and the two-node fallback doesn't fix it,** v1 launches on the price cap only: PRs 1–4 plus a price-cap version of the report. Time-of-use tariffs become the first follow-up. Magnus makes the call at that point.
- **If time slips,** cut in this order: Agile first, then the well-installed scenario. Cosy, solar and payback stay, because the project outline names them.

---

## Edge cases and considerations

### Known risks
- **HEM under a schedule may disagree more than under continuous heating.** One node responds more slowly than HEM's per-element nodes, and the gap between operative and air temperature matters more under setback. Mitigations: the pre-registered rules, the two-node fallback, and the flat-tariff PRs landing first.
- **The recalibrated setpoint may be implausible.** If it falls outside 16–21 °C, stop and review rather than force a fit.
- **Agile's past year may be unusual, and is paired with typical weather.** Both are stated in the report.
- **Cosy's periods or rates may change during the phase.** The snapshot is dated, the row has a cadence, and the report shows the date.
- **Speed:** the guards are the single-run target and an allocation-free loop.
- **Data access:** Electrification of Heat data may need registration, which only Magnus can do. The published reports are the fallback.
- **Neutrality:** the heat pump schedule, boost and well-installed scenario could tilt results. Each is a sourced or clearly approximate row, appears in the sensitivity table, and is never tuned towards an answer.

### Security
- As phase 1: no server, no user data, no secrets. The Octopus endpoints used need no key.

---

## Technical debt

Closed by this phase: [#7](https://github.com/mannepanne/energy-sim/issues/7), [#9](https://github.com/mannepanne/energy-sim/issues/9) (its MCS cross-check moves to [#24](https://github.com/mannepanne/energy-sim/issues/24)), [#13](https://github.com/mannepanne/energy-sim/issues/13), [#18](https://github.com/mannepanne/energy-sim/issues/18) and [#20](https://github.com/mannepanne/energy-sim/issues/20). [#15](https://github.com/mannepanne/energy-sim/issues/15) also closes, if the heat pump schedule is sourced.

Carried forward:
- [#8](https://github.com/mannepanne/energy-sim/issues/8): verify the 2026 gas carbon factor. It is quick, and done in the tariffs PR if the DESNZ file is available.
- [#14](https://github.com/mannepanne/energy-sim/issues/14): fabric error versus behaviour. Phase 2 adds the archetype gaps as evidence. Settling it needs homes with known fabric.
- [#15](https://github.com/mannepanne/energy-sim/issues/15): if the heat pump schedule can't be sourced.
- [#16](https://github.com/mannepanne/energy-sim/issues/16): one fixed weather year. Phase 2 adds a price scenario.
- [#17](https://github.com/mannepanne/energy-sim/issues/17): the annual grid carbon factor.
- [#24](https://github.com/mannepanne/energy-sim/issues/24): cross-check the derived geometry against an MCS heat loss calculator (split from #9).
- [#26](https://github.com/mannepanne/energy-sim/issues/26): window areas use the RdSAP 2012 formula, because RdSAP 10 has none.
- [#27](https://github.com/mannepanne/energy-sim/issues/27): the air change rate is an estimate by age band, not RdSAP's ventilation worksheet.

New, tracked when their code lands:
- a simple output cap rather than heat pump sizing, and no backup heat;
- one location;
- undiscounted payback, assuming the boiler needs replacing now;
- Agile represented by a past year on typical weather;
- weekdays taken from the 2026 reference year ([#25](https://github.com/mannepanne/energy-sim/issues/25));
- no carbon credit for export;
- the heat pump's standby is a share of its electricity, not kWh a day, so small houses get less of it and their mild hours stay a little optimistic against the Electrification of Heat daily data (see `REFERENCE/engine.md`).

---

## Related documentation

- [Project outline](./ORIGINAL_IDEA/project-outline.md) and [model and register spec](./ORIGINAL_IDEA/home-energy-simulator-spec.md)
- [Phase 1 spec (archived)](./ARCHIVE/01-engine-core.md), [engine.md](../REFERENCE/engine.md) and [register.md](../REFERENCE/register.md)
- [ADR: client-side, build-time snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md)
- [ADR: typed parameter register](../REFERENCE/decisions/2026-10-17-typed-parameter-register.md)
- [ADR: calibration to NEED](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md)
