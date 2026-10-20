# The engine

**When to read this:** changing the physics, reading engine results, adding an input, or checking how a number is calculated.

The engine is a pure TypeScript library in `src/engine/`. It reads no files and makes no network calls, so the same code runs in tests, scripts and (in phase 3) the browser. It runs one house with one heating setup, with or without roof solar, over the 8,760 hours of a typical year, using typed arrays rather than an object per hour. A house is one of ten archetypes, adjusted by quick facts. Every number it uses comes from the [register](./register.md); only physical constants and method settings live in code.

What phase 1 built and why is in the [phase 1 spec](../SPECIFICATIONS/ARCHIVE/01-engine-core.md); phase 2's plan is in the [phase 2 spec](../SPECIFICATIONS/02-complete-v1-model.md). Why the temperature is an air temperature calibrated to measured gas use is in the [calibration ADR](./decisions/2026-10-17-air-temperature-calibrated-to-need.md).

## Files

| File | What it does |
| --- | --- |
| `constants.ts` | Physical constants and unit conversions: hours in a year, 0.33 Wh/m³K for air, 4.18 kJ/kgK for water |
| `archetypes.ts` | The archetype keys, the quick-facts answers, `House`, `defaultHouse(access, archetype)`, `wallAnswers` and SAP occupancy |
| `inputs.ts` | `readInputs(access, { house, overrides, spfScenario })`: reads every input for one house into one `EngineInputs` object, one reader per subsystem (geometry, fabric, gains, heating, hot water, prices, solar), deriving geometry, the ground floor U-value and the roof's PV maximum; `uncertainDraws(access, house, spfScenario)` lists the uncertain values it reads |
| `weather.ts` | `weatherFromSnapshot(snapshot)` and `prepareWeather(weather, inputs)` |
| `solar.ts` | Sun position, irradiance on a tilted surface, the hourly mean irradiance on four walls, and the sun's path (`sunPath`, `planeIrradiance`) for irradiance on the roof |
| `pv.ts` | Roof solar: the roof's maximum size, hourly generation, and `useSolar`, which shares each hour's generation between the loads and export |
| `geometry.ts` | `deriveGeometry(facts)`: element areas and volume; `heatLoss(inputs)`: the heat loss coefficient H |
| `groundFloor.ts` | The ground floor U-value by BS EN ISO 13370, as RdSAP 10 section 5.12 applies it |
| `calendar.ts` | The time base: UTC engine hours to UK local time, weekly and daily profiles, and Agile half-hours (see "Time base") |
| `demand.ts` | Solar gains, hourly space heat, and the day's hot water |
| `supply.ts` | Gas for heat (÷ boiler efficiency), the boiler's pump and fan electricity, base electricity by hour, and the cost of a kWh of heat |
| `heatPump.ts` | The heat pump's hourly COP: the compensation line, the clamped shape, the k solve and the electricity (see "The heat pump over the year") |
| `cylinder.ts` | The heat pump setups' hot water cylinder, stepped hour by hour |
| `costCarbon.ts` | Annual cost, net of export income and split into a gas part and an electricity part, and annual carbon |
| `simulate.ts` | `simulate(inputs, preparedWeather, heating, { copScale, solar })`: one house, one heating system (`gas` or `heatPump`), with or without solar, one year |
| `setups.ts` | The four setups (`gas`, `gasSolar`, `heatPump`, `heatPumpSolar`), the reference (`gas`), and `runningCostReads(setup, id)`: which uncertain values can change a setup's running cost |
| `payback.ts` | Each setup's kit and upfront cost after the grant, replacements inside a horizon, the price scenario, `paybackYear` and the payback summary (see "Costs, grants and payback") |
| `sampling.ts` | Seeded, stable draws with a Gaussian copula: `drawSamples(rows, plan, correlations)`, `sampleOverrides(access, plan, house, spfScenario)`, the normal CDF and the inverse distribution functions |
| `compare.ts` | `runSetups(access, weather, plan, { house, spfScenario, setups })` runs any of the four setups on the same samples; `compare(run)` gives the bands, the paired differences against the reference, the share cheapest and payback |
| `sensitivity.ts` | `sensitivity(access, weather, pairs, house)`: one table per pair of setups, each uncertain row or cell either setup reads at its low and its high, ranked by its effect on the pair's cost difference |
| `testing/fixtureRegister.ts` | Test support: builds inline fixture registers, starting from the fixture house below |

## Running the engine

```typescript
const access = createAccessor(loadRegister(registerJson));
const house = defaultHouse(access, 'semi1930s'); // or { ...house, loft: 'none', occupants: 2 }
const inputs = readInputs(access, { house }); // the central run: every uncertain row at its default
const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(snapshotJson)), inputs);
const gas = simulate(inputs, weather, 'gas');
const heatPump = simulate(inputs, weather, 'heatPump');
const heatPumpWithSolar = simulate(inputs, weather, 'heatPump', { solar: true });
gas.annual.gasKwh; // also spaceHeatKwh, hotWaterKwh, electricityKwh, generationKwh, selfConsumedKwh, solarUsedBy, importKwh, exportKwh, cost, carbonKg, and hourly arrays
```

- **Houses.** A `House` is an archetype key, a floor area, an occupant count (1–5) and three quick-facts answers: loft (`none`, `about100mm`, `270mmOrMore`), walls (`asBuilt`, `cavityFilled`, `solidWallInsulated`) and glazing (`single`, `olderDouble`, `newerDouble`). `defaultHouse` gives the archetype's defaults. `readInputs` with no house reads the 1930s semi (`REFERENCE_ARCHETYPE`), the house the behaviour rows are calibrated on.
- **Only answers that fit are offered.** `wallAnswers(access, archetype)` lists the wall answers that have a U-value for the archetype's band and construction: solid brick offers `asBuilt` and `solidWallInsulated`, cavity bands C–G offer `asBuilt` and `cavityFilled`, and bands K and L offer `asBuilt` only. `readInputs` throws on any other answer, on a floor area that is not positive, and on an occupant count outside 1–5.
- **Overrides.** `readInputs(access, { overrides: { 'heating.heatPumpSpf': 3.2 } })` replaces an uncertain row's default, and is the hook for sampling. An uncertain table cell is overridden under `rowId|key`. A value that is not a finite number throws, and so does an override the house does not read (a typo, for example).
- **The SPF scenario.** `spfScenario: 'wellInstalled'` reads `heating.heatPumpSpfWellInstalled` in place of `heating.heatPumpSpf`; every other value is the same. `sampleOverrides` and `runSetups` take the scenario too, and the two scenarios share every draw but the SPF, so they pair sample by sample.
- **The heat pump's k.** `simulate` solves the COP scale k on its own run unless it is given one (`{ copScale }`), and returns the k it used as `copScale`. Solving on its own run is right only for the reference run (price cap, no control): a caller that applies control or a time-of-use tariff must pass the reference run's `copScale` (see "The heat pump over the year").
- **Solar.** `{ solar: true }` adds roof solar to either heating system, sized by `inputs.pv`. `setups.ts` names the four setups: each heating system with and without solar. Solar changes no heat, so it changes no k. Without solar, `importKwh` is `electricityKwh` and generation and export are zero, so a run without solar gives the same results as an engine with no solar model. `runSetups` computes the roof's generation once a sample and passes it to both solar setups (`{ generationKwh }`).
- **Prepared weather** holds the outdoor temperature, the hourly mean wall irradiance, the horizontal irradiance and the sun's path. It depends only on fixed rows, so one preparation serves every sample. The roof's direction is sampled, so irradiance on the roof is computed on each solar run from the prepared sun path.
- **Overrides are not user overrides.** The sampling hook follows row kind. The register's `overridable` flag, for what a visitor may change, also covers fixed rows (U-values, prices, cylinder loss), and excludes some uncertain ones (fabric quality factor, internal gains). How user overrides reach the engine is a phase 3 decision (see [SPECIFICATIONS/CLAUDE.md](../SPECIFICATIONS/CLAUDE.md)).
- **Prepared weather must match the inputs.** `simulate` does not check that the weather was prepared with the same sample minute and ground reflectance. Both are fixed rows today; if either becomes uncertain, prepare the weather per sample.
- **Speed.** `simulate` takes about 1–2 ms for a year on a recent Mac, and `prepareWeather` a few ms, run once. So 500 samples × 2 setups take about 1.5 seconds, and × 4 setups about 3 seconds (19 October 2026). Each result holds eight hourly arrays (about 560 KB), so a sampler should keep only the annual totals.

## The physics

### Geometry, derived from a few facts

Each archetype is a type, an RdSAP age band, a number of storeys, a wall construction, a default floor area and bedroom count, a footprint aspect ratio (depth ÷ width) and a number of party walls. The engine derives the rest (`deriveGeometry`):

```
footprint          = floor area ÷ storeys;  width = √(footprint ÷ aspect);  depth = aspect × width
exposed perimeter  = 2 (width + depth) − party walls × depth
wall height        = storeys × room height + (storeys − 1) × 0.25 m        (RdSAP 10 §3.6)
external wall area = exposed perimeter × wall height − windows − door
party wall area    = party walls × depth × wall height
window area        = slope × floor area + intercept                          (RdSAP 2012 Table S4, by band)
roof = ground floor = footprint;  heated volume = footprint × wall height
```

The room height is a table row by age band; the door is 1.85 m² (RdSAP 10 §3.7). RdSAP 10 measures windows on site and has no default formula, so the RdSAP 2012 formula stands in.

### Ground floor U-value

RdSAP 10 §5.12 computes the floor U-value by BS EN ISO 13370 from its area A, exposed perimeter P and the wall thickness w (RdSAP 10 Table 3), with clay soil (λ = 1.5 W/m·K), Rsi = 0.17 and Rse = 0.04 m²K/W, rounded to two decimal places. The floor construction and insulation come from RdSAP 10 Table 19 by age band: suspended timber for band A, solid from band C, with 100 mm of insulation in bands K and L.

```
B = 2A ÷ P
solid:      dt = w + λ (Rsi + R_insulation + Rse)
            U = 2λ ln(πB/dt + 1) ÷ (πB + dt)            if dt < B, else  U = λ ÷ (0.457 B + dt)
suspended:  dg = w + λ (Rsi + Rse);  Ug = 2λ ln(πB/dg + 1) ÷ (πB + dg)
            Ux = 2 h Uw ÷ B + 1450 ε v fw ÷ B
            U = 1 ÷ (2 Rsi + R_deck + 1 ÷ (Ug + Ux))
```

The suspended-floor parameters (h = 0.3 m, Uw = 1.5 W/m²K, ε = 0.003 m²/m, v = 5 m/s, fw = 0.05, R_deck = 0.2 m²K/W) are cells of the `fabric.groundFloor` row.

### Heat loss

```
H = f_fabric × (Σ U·A + y × A_exposed + 0.33 · n · V)       W/K
```

- **The elements** are the external walls, party walls, windows, door, roof and ground floor.
- **U-values** come from RdSAP 10 tables, keyed by age band, construction and quick-facts answer.
  - A party wall loses heat when it is a cavity wall: 0.25 W/m²K for a house whose party wall construction is unknown, and 0 for solid masonry (Table 15).
  - The window U-value has curtains added, 1 ÷ (1/U + 0.04) (SAP 10.2 §3.2).
- **Thermal bridging** is y × the exposed area of walls, windows, door, roof and ground floor, with y from RdSAP 10 Table 21: 0.15 W/m²K for bands A–I and 0.08 for K–M.
- **The air change rate n** is a table row by age band.
- **`f_fabric`** is the fabric quality factor, one shared multiplier on every term.

### Space heat at a mean internal temperature

```
Q(t) = max(0, H (T_mean − T_out(t) − offset) − G_solar(t) − G_internal)      for each of 8,760 hours
```

`T_mean` is an **air** temperature, held continuously. The house has no thermal mass. `offset` is the outdoor-temperature offset row (0 for the typical year; tests lower it to build a colder year). The `max(0, …)` clamp means surplus gains in summer never make demand negative. Each hour's mean power in W ÷ 1,000 is its energy in kWh.

### Internal gains

A constant wattage: 0.78 W per m² of floor area plus an uncertain 107 W per occupant (75–140). Both terms are fitted to SAP 10.2 Table 5 column (A) with SAP's occupancy (see the rows' rationales). The default occupant count is SAP 10.2 Table 1b's N for the floor area, rounded, within 1–5: 3 for the 1930s semi.

### Solar gains

```
G_solar(t) = 0.9 × window area × g⊥ × frame factor × solar access factor × I_wall(t)
```

The 0.9 is SAP 10.2's ratio of average to normal-incidence transmittance (equation 5). g⊥ comes from RdSAP 10 Table 24 by glazing answer: 0.85 single, 0.76 double before 2002, 0.72 double or triple from 2002.

`I_wall(t)` is the irradiance on a vertical wall, averaged over walls facing north, east, south and west, because the windows are split equally between them. For each hour and wall:

1. **Sun position** at the hour's UTC time plus the irradiance sample minute row (10 minutes). Declination and the equation of time follow Spencer (1971); hour angle uses the snapshot's longitude. The formulas are Duffie and Beckman's (*Solar Engineering of Thermal Processes*, 4th edition), eqs. 1.5.3, 1.6.1b, 1.6.2 and 1.6.5.
2. **Isotropic sky** (Liu and Jordan; Duffie and Beckman eq. 2.15.1):
   `I = Gb(n) × max(0, cos θ) + Gd(h) × (1 + cos β)/2 + G(h) × ρ × (1 − cos β)/2`.
   For a wall, β = 90°, so it gets half the sky diffuse and, at ρ = 0.2, a tenth of the global horizontal. The beam counts only when the sun is above the horizon. θ is the angle between the sun and the wall's normal.

**Why 10 minutes past the hour.** PVGIS labels each hour HH:00. The 10 minutes is inferred from the data, not taken from PVGIS documentation. Beam and diffuse must add up to global: `Gb(n) × cos(zenith) + Gd(h) = G(h)`. Over the London snapshot the mismatch is 1.5% of annual global irradiance with the sun at HH:00, 0.24% at HH:10, and 2.6% at HH:30. A test repeats this check. It guards the sun position, the equation of time and the UTC handling together.

On the London snapshot, mean wall irradiance is about 74 W/m², so the 1930s semi gains about 490 W of solar heat on average over the year.

### Hot water

```
draw-off per day = L × 4.18 × (T_delivery − T_cold) ÷ 3,600      kWh
draw-off in hour t = draw-off per day × profile[local hour of t]
```

L is litres a day: 36 plus an uncertain 25 per occupant (17–35), SAP 2012's 25N + 36. That is 111 litres a day for the 1930s semi's 3 occupants. The per-occupant hot water and gains terms are correlated (see "Sampling"). The draw-off profile (`hotWater.drawOffProfile`) gives each local hour's share of the day, from the Energy Saving Trust's measurements in about 120 English homes (2008): peaks of 9.7% at 07:00 and 8.0% at 18:00, and under 1.5% an hour between midnight and 06:00; the shares must sum to 1, or reading the inputs fails. The calendar module converts local hours to engine hours, so on the night the clocks go back the 01:00 share is drawn twice, and on the night they go forward it is skipped; the year's total is unchanged.

- **Gas setups** have a combi boiler, so the boiler heats the draw-off in the hour it is drawn.
- **Heat pump setups** have a cylinder (`cylinder.ts`), held as one stored-energy state above the cold feed: 200 litres at a 50 °C setpoint stores 9.29 kWh. Each hour the draw-off and an hour's standing loss (1.5 kWh a day ÷ 24) come out. If the store is then below its minimum (45 °C), the heat pump reheats it to the setpoint within the hour, so it never ends an hour below the minimum and can't run out. The reheats are the heat pump's hot water heat. The store is one temperature, not stratified, so the minimum is a reheat trigger, not a tap temperature. No immersion backup is modelled. The cylinder starts the year full, so the year's reheats = draw-off + standing loss − the fall in stored heat over the year (at most 1.16 kWh); a test checks this balance.

### Supply

- **Gas:** gas kWh = (space heat + hot water) ÷ boiler seasonal efficiency, hour by hour.
- **The boiler's pump and fan:** 86 kWh of electricity a year (SAP 10.2 Table 4f), spread over the year in proportion to each hour's gas use. The heat pump setups have none.
- **Heat pump:** each hour, electricity = space heat ÷ COP at the space heating flow + cylinder reheat ÷ COP at the hot water flow. The COP curve is scaled so the year matches the sampled SPF (see "The heat pump over the year"). Capacity is unlimited and there is no backup heater.
- **Base electricity** (lights and appliances) is the same in every setup. Each engine hour gets the weekly shape (`electricity.baseProfileWeekly`, by local hour of the week) × the month level (`electricity.baseProfileMonthly`, by local month), and the year is rescaled so its total equals the base use row exactly. Both rows come from Elexon's profile class 1 (domestic unrestricted), 2013/14, evaluated at 10-year average temperatures: a weekday peaks at 18:00 local and dips at 03:00, and January days use about 35% more than July days. On a flat tariff the shape changes no annual figure; it matters for solar self-consumption and, later, time-of-use costs.

### Roof solar PV

```
I_roof(t)   = isotropic sky on the roof: tilt 35°, direction sampled (south-east to south-west)
T_cell(t)   = T_air(t) + 0.031 K per W/m² × I_roof(t)
generation  = P × I_roof ÷ 1,000 × (1 − 0.004 × (T_cell − 25)) × (1 − 0.14)        kWh in the hour
P           = min(sampled size, roof maximum)
roof maximum = footprint ÷ cos(pitch) × ½ × 0.7 usable × 0.2 kWp per m²
```

- **Irradiance on the roof** uses the same isotropic-sky transposition as the walls (Duffie and Beckman eq. 2.15.1), with the sun at the irradiance sample minute. `sunPath` holds the sun's direction each hour as three components, so any roof direction costs one multiply-add per hour: cos θ = cos β × cos zenith + sin β × (cos γ × south + sin γ × west). A test checks it against the direct formula hour by hour.
- **Tilt** is a fixed row (35°), and also the roof pitch in the roof maximum, since the panels lie on the roof. **Direction** is uncertain: triangular, −45° to +45° from south, mode south, west positive (PVGIS's aspect uses the same convention).
- **Temperature:** the cell runs above the air temperature in proportion to the irradiance on it (the NOCT relation for a module with a NOCT of 45 °C), and output falls 0.4% per K above 25 °C. Air temperature is the snapshot's, plus the outdoor offset row. Generation is never negative.
- **System loss** (14%, PVGIS's suggested default) covers the inverter, cables, mismatch and soiling. Reflection at the glass and spectral effects are not modelled; the PVGIS check measures them.
- **Size:** uncertain, 2.5–6 kWp with a mode of 4, clipped to what one roof slope takes. The roof footprint is the derived footprint. At their defaults, six of the ten archetypes are clipped below 4 kWp: the pre-1900 mid-terrace (3.72 kWp), the 1930s semi (3.85), the 1950s semi (3.76), the 1970s mid-terrace (3.42), the 2000s semi (3.63) and the 2010s mid-terrace (3.67). The other four take the full 4 kWp. The usable share of the slope decides most of this, so it is uncertain too (0.5–0.85, mode 0.7): on a clipped house the spread of sizes is mostly the spread of that row. `pvRequestedPeakPowerKw` and `pvRoofMaximumKw` in the inputs say whether a size was clipped.
- **Use each hour** (`useSolar`): generation meets base use first, then heating (the heat pump's space heating and standby electricity, or the boiler's pump and fan), then the heat pump's cylinder reheats; the rest is exported, and what the loads still need is imported. With no control, the order only says which load solar met; import and export would be the same in any order. Under the tariffs PR's control rules (phase 2 spec, PR 6), the cylinder may also be reheated to use surplus generation.
- **Exports never exceed generation**, and every hour balances: generation + import = electricity used + export. Tests check both.

### The heat pump over the year

The reasons are in the [COP curve ADR](./decisions/2026-10-19-heat-pump-cop-curve-anchored-on-field-spf.md).

```
T_flow,space(t) = the compensation line at T_out(t): 45 °C at −2 °C outdoors, 30 °C at 15 °C, linear between, flat beyond
shape(t)        = clamp((T_flow + 273.15) ÷ (T_flow − T_out + 10 K), 4, 15)
COP(t)          = min(7, k × shape(t))
electricity(t)  = standby + space heat(t) ÷ COP_space(t) + cylinder reheat(t) ÷ COP_hot water(t)
standby         = standby share × Σheat ÷ SPF ÷ 8,760, the same in every hour
```

- **T_out** is the weather's temperature plus the outdoor offset row, as for space heat. Hot water uses a fixed 50 °C flow, the mean over a reheat. A test keeps it at or above the high of the design flow's range, so hot water's COP is never above space heating's in the same hour, and below it at the default flows.
- **Standby** (controls, circulation pumps and crankcase heaters) is inside the SPF's H4 boundary. `heating.heatPumpStandbyShare` sets it as a share of the year's heat pump electricity: median 5.9%, from the trial's daily data, about 0.68 kWh a day for the 1930s semi. The well-installed scenario reads its own share (`heating.heatPumpStandbyShareWellInstalled`, median 2.5%, from HeatpumpMonitor.org). Standby is drawn evenly in every hour, so hours with little heat are less efficient, as the trial's data shows. It is a share rather than kWh a day so the solve works for any house: a fixed amount would leave a small house too little electricity for its heat. As a result, small houses get less standby in kWh than the trial's typical home, and their mild hours stay a little optimistic.
- **The k solve** (`solveCopScale`) runs on the reference run: the price cap, no control, continuous heating. It makes the year's heat (space heat + cylinder reheats) ÷ heating electricity (standby included) equal the sampled SPF. The heat itself gets the electricity left after standby, E = (1 − share) × Σheat ÷ SPF.
  - **Without the ceiling:** k = Σ(heat ÷ shape) ÷ E, exactly.
  - **With the ceiling:** hours where k × shape would reach 7 run at 7, and k is re-solved on the rest: k = Σ(uncapped heat ÷ shape) ÷ (E − capped heat ÷ 7). Capping raises k, which may cap more hours, so this repeats until no further hour is capped. Each step caps at least one more hour, so it ends, and at the end it is exact. `copScale.ceilingBound` says whether it bound.
  - It throws if the run delivers no heat, or if the share is not below 1 − SPF ÷ 7: at or above that, even every hour at the ceiling couldn't supply the heat. A test keeps each scenario's highest share below the bound for its highest SPF (0.25 against 0.43 for the field trial, 0.10 against 0.23 for well-installed).
  - The returned `copScale` carries the standby per hour with k, so a run that reuses the scale reuses the reference run's standby too.
- **On the reference run the curve changes when electricity is used, not how much.** So on the price cap, the flow temperature and standby share rows move nothing in the sensitivity table. They matter once control and tariffs move running between hours, which reuses the reference run's k.
- **What the numbers look like** (19 October 2026, 200 samples, seed 1): k runs from 0.28 to 0.68 for the field-trial SPF (central 0.41), and from 0.40 to 0.76 for the well-installed one. The ceiling binds in 3 samples of 200 for the field trial and 68 of 200 for the well-installed scenario, whose SPF reaches 5.4. At the lowest SPF (2.0), k × the shape floor is still above 1, which a test checks.
- **The well-installed scenario** reads `heating.heatPumpSpfWellInstalled` (lognormal, median 3.9, sigma 0.14, clipped to 2.8–5.4, from 379 air source systems on HeatpumpMonitor.org with a full year of data) in place of the field SPF (median 2.8). It changes the curve's level, not its shape. The sample is self-selected, and the report labels the scenario so.

**The Electrification of Heat cross-check.** The curve's shape and the compensation line are compared with the trial's published performance by outdoor and flow temperature. It is a check, not a fit: see "Checks against outside references".

### Cost and carbon

- Cost = kWh × unit rate + standing charges, at the flat price cap, less export income. Both setups pay the electricity standing charge. **The heat-pump-only house has no gas supply, so it pays no gas standing charge.**
- **Electricity is costed on imports, and export earns the flat export rate** (`prices.exportRate`, Outgoing Octopus). Without solar, imports are all the electricity used and export is zero. So **the running cost of a solar setup is net of its export income.**
- **The cost is split by fuel:** `gasPounds` (gas unit and standing charges) and `electricityPounds` (electricity unit and standing charges less export income). Payback grows each part by its own real price change.
- Carbon = gas kWh × gas factor + imported electricity kWh × the annual average grid factor. Exported kWh are reported but earn no carbon credit; the phase 2 report will state this convention.

## Costs, grants and payback

`payback.ts` turns a sample's capital costs, price scenario and year-one running costs into a payback year. It runs after the hourly engine and never changes a year's running cost. The rows are in [register.md](./register.md#the-cost-and-price-scenario-rows).

### What each setup buys

| Setup | Kit | Upfront |
| --- | --- | --- |
| `gas` (the reference) | A replacement combi boiler | Boiler |
| `gasSolar` | Boiler and PV | Boiler + PV size × cost per kWp |
| `heatPump` | Heat pump, with its cylinder and typical radiator changes | Heat pump − the grant |
| `heatPumpSolar` | Heat pump and PV | Heat pump − the grant + PV size × cost per kWp |

- **The grant** (`costs.boilerUpgradeSchemeGrant`, £7,500) comes off the heat pump's first installation, capped at its cost. It never comes off a replacement heat pump, because a property that has had the grant cannot claim it again. Gas setups get no grant.
- **PV size** is the system size after the roof limit (`inputs.pv.peakPowerKw`).
- **v1 assumes the boiler needs replacing now,** so the reference pays for a boiler today. A question about the boiler's age is a phase 3 option.
- **Lifetimes** are drawn as uncertain rows and rounded to whole years (at least one).

### Horizons and replacements

- **A setup against the reference:** the horizon is the heat pump's lifetime for `heatPump` and `heatPumpSolar` (any PV value left at the end is ignored), and PV's lifetime for `gasSolar`.
- **Solar's own payback** compares `gasSolar` with `gas`, and `heatPumpSolar` with `heatPump`, over PV's lifetime. It is reported separately, so solar can't hide a heat pump that doesn't pay back.
- **Replacements:** every component is replaced, at today's real cost, at the end of each year in which its lifetime ends, while that year is strictly inside the horizon. A lifetime ending exactly at the horizon is not replaced, because the horizon ends with it. The rule applies to both sides, so the reference's boiler replacements count against the reference, and a gas setup's own boiler replacements cancel against them. PV's shortest lifetime is no shorter than the heat pump's longest, so PV is never replaced inside a heat pump horizon.

### The price scenario

- **Year 1 is today's prices.** In year t, the gas part of a running cost is multiplied by (1 + g)^(t−1) and the electricity part, net of export, by (1 + e)^(t−1).
- g and e are `prices.gasRealChange` and `prices.electricityRealChange`, real changes a year after inflation. They are drawn once per sample, shared by every setup, and correlated through the copula (`prices.realChangeCorrelation`, 0.6).
- Each change scales its fuel's unit rate and standing charge together, and export follows electricity. When Cosy and Agile land (phase 2 spec, PR 6) they keep their shape relative to the cap.
- **Payback is undiscounted:** a pound saved in year 15 counts the same as one spent today, in real terms.

### Payback

For one sample, with the option and the baseline (the reference, or the same heating without solar):
1. **Extra upfront** = option upfront − baseline upfront. If it is £0 or less, **payback is year 0**.
2. Start the position at −extra upfront. For each year t = 1 to the horizon, add the baseline's running cost minus the option's (both under the price scenario), then add the baseline's replacements and subtract the option's.
3. **Payback is the first year in which the position reaches £0 or more.** If it never does within the horizon, including when the option costs more to run, the sample **doesn't pay back** (`DOES_NOT_PAY_BACK`, which ranks after every year).

The position is checked at the end of each year, after that year's replacements. Payback is in whole years.

**The summary** for a comparison is the central run's payback, the share of samples that pay back, and the median and P10–P90. Percentiles use the same interpolation as every other band (type 7). A percentile that falls on a sample that doesn't pay back, or between one and a year, is **"beyond lifetime"**.

### The hand-worked examples

`payback.test.ts` reproduces these exactly. The reference is a £3,000 boiler with £800 of gas and £400 of electricity a year. The heat pump has a 15-year horizon.

**1. Normal payback.** A £12,000 heat pump less the £7,500 grant costs £4,500, so the extra upfront is £1,500. It costs £1,000 a year to run. Gas prices rise 5% a year in real terms, and electricity stays flat. The boiler lasts 10 years.

| Year | Reference cost | Saving | Cumulative saving |
| ---: | ---: | ---: | ---: |
| 1 | 800 + 400 = £1,200 | £200 | £200 |
| 2 | 840 + 400 = £1,240 | £240 | £440 |
| 3 | 882 + 400 = £1,282 | £282 | £722 |
| 4 | 926.10 + 400 = £1,326.10 | £326.10 | £1,048.10 |
| 5 | 972.41 + 400 = £1,372.41 | £372.41 | £1,420.51 |
| 6 | 1,021.03 + 400 = £1,421.03 | £421.03 | £1,841.53 |

The cumulative saving first covers £1,500 in **year 6**. The boiler's first replacement would be at year 10, so it plays no part.

**2. A reference boiler replacement inside the horizon.** As example 1, but the heat pump costs £1,100 a year to run and prices don't change, so the saving is £100 a year.
- With a boiler that outlasts the horizon, £1,500 at £100 a year takes until **year 15**.
- With a 10-year boiler, the reference pays £3,000 for a new one at the end of year 10. The position after year 10 is −1,500 + 10 × 100 + 3,000 = £2,500, and after year 9 it is −£600. So payback is **year 10**.

**3. Year 0.** A heat pump that costs £9,000 costs £1,500 after the grant, which is less than the £3,000 boiler. The extra upfront is −£1,500, so payback is **year 0**, whatever it costs to run.

**4. Doesn't pay back.** As example 2, but the heat pump costs £1,300 a year to run, £100 more than the reference, and the boiler lasts 15 years. Its lifetime ends exactly at the horizon, so it is not replaced, and the position only falls: the sample **doesn't pay back**. With a 10-year boiler instead, the replacement alone recovers the cost: −1,500 − 10 × 100 + 3,000 = £500 at year 10.

**5. The summary.** Five samples pay back in years 6, 10 and 0, and two don't. Ranked: 0, 6, 10, then the two that don't.
- The share that pays back is 3 ÷ 5 = 60%.
- The median sits on the third value: year 10.
- P10 sits 0.4 of the way from 0 to 6: year 2.4.
- P90 sits between two samples that don't pay back: **beyond lifetime**.

## The fixture house

Engine tests use small inline registers, built by `fixtureRegister(values)`, so they never depend on `data/register.json`. The base values describe a house with round numbers, chosen so every result can be worked by hand. Every archetype key and age band gets the same values. `geometry.test.ts`, `groundFloor.test.ts` and `simulate.test.ts` reproduce these figures.

**Geometry:** 100 m² over two storeys of 2.5 m with no upper-storey allowance, an aspect ratio of 2 and one party wall. So the footprint is 5 m × 10 m, the exposed perimeter 2 × 15 − 10 = 20 m, the gross wall 20 × 5 = 100 m², the windows 0.1 × 100 = 10 m², the door 2 m², the net wall 88 m² and the volume 250 m³.

**Ground floor:** solid, uninsulated, wall thickness 250 mm. B = 2 × 50 ÷ 20 = 5 m, dt = 0.25 + 1.5 × (0.17 + 0.04) = 0.565 m, and U = 2 × 1.5 × ln(π × 5 ÷ 0.565 + 1) ÷ (π × 5 + 0.565) = 0.6195, rounded to 0.62.

**Heat loss coefficient** (party wall U = 0, no thermal bridging, no curtain resistance):

| Element | Area (m²) | U (W/m²K) | U × A (W/K) |
| --- | ---: | ---: | ---: |
| External walls | 88 | 1.0 | 88 |
| Windows | 10 | 3.0 | 30 |
| Door | 2 | 2.5 | 5 |
| Roof | 50 | 0.5 | 25 |
| Ground floor | 50 | 0.62 | 31 |
| **Fabric** | | | **179** |
| Ventilation: 0.33 × 0.8 ach × 250 m³ | | | **66** |
| **H** (fabric quality factor 1) | | | **245** |

At a fabric quality factor of 0.9, H = 220.5 W/K. With a party wall U of 0.25 and y = 0.1, H = 245 + 50 × 0.25 + 0.1 × 200 = 277.5 W/K.

**A year at a constant 5 °C with no sun**, heated to 20 °C. The fixture's occupancy formula gives 4 occupants at any floor area, so internal gains are 4 × 100 = 400 W and hot water is 20 + 4 × 20 = 100 litres a day:

| Quantity | Working | Result |
| --- | --- | ---: |
| Space heat each hour | (245 × (20 − 5) − 400) ÷ 1,000 | 3.275 kWh |
| Space heat a year | 3.275 × 8,760 | 28,689 kWh |
| Hot water a day | 100 L × 4.18 × (50 − 10) ÷ 3,600 | 4.644 kWh |
| Hot water a year | 4.644 × 365 | 1,695.2 kWh |
| Gas (boiler 0.8) | (28,689 + 1,695.2) ÷ 0.8 | 37,980.3 kWh |
| Heat pump heat | 28,689 + (4.644 + 1.5) × 365 | 30,931.7 kWh |
| Heat pump electricity (SPF 2.5) | 30,931.7 ÷ 2.5 + 2,920 base | 15,292.7 kWh |

**Roof solar on the fixture house.** 4 kWp at 35° facing south, a 10% system loss, no temperature effect, a usable fraction of 1 and 0.2 kWp per m²: the roof takes 50 ÷ cos 35° × ½ × 0.2 = 6.10 kWp, so 4 kWp is not clipped. With no beam and 100 W/m² of diffuse and global in every hour, the roof gets 100 × (1 + cos 35°)/2 + 100 × 0.2 × (1 − cos 35°)/2 = 92.8 W/m², so the system makes 4 × 0.0928 × 0.9 = 0.334 kWh every hour. That covers the gas setup's 1/3 kWh of base use, so it imports nothing and exports the rest; the heat pump setup uses all of it. The base profiles are even, so base use is 1/3 kWh in every hour.

The draw-off and standing loss take 0.256 kWh an hour from the cylinder, so the 1.16 kWh band between 50 °C and 45 °C empties every 5 hours. 8,760 hours is a whole number of those cycles, so the cylinder ends the year full and its reheats equal draw-off plus loss exactly. The fixture's auxiliary electricity row is 0 and its draw-off profile is even, so the gas setup's electricity is base use alone. With a constant outdoor temperature, every hour has the same COP shape, so the year's COP is the SPF in every hour.

## Two archetypes by hand

`geometry.test.ts` reproduces these on the real register.

**The 1930s semi** (90 m², two storeys, aspect 1.1, one party wall, room height 2.5 m, band C):
- footprint 45 m²: width √(45 ÷ 1.1) = 6.396 m, depth 7.036 m;
- exposed perimeter 2 × (6.396 + 7.036) − 7.036 = 19.83 m;
- wall height 2.5 + 2.75 = 5.25 m, so gross wall 104.10 m²;
- windows 0.122 × 90 + 6.875 = 17.86 m², door 1.85 m², net wall 84.39 m²;
- party wall 7.036 × 5.25 = 36.94 m², volume 45 × 5.25 = 236.25 m³;
- solid floor: B = 90 ÷ 19.83 = 4.539, dt = 0.565, U = 3 × ln(π × 4.539 ÷ 0.565 + 1) ÷ (π × 4.539 + 0.565) = 0.66.

With its default filled cavity walls (U 0.7), H = 274 W/K: fabric 166.5 (walls 59.1, party wall 9.2, windows 45.0, door 5.6, roof 18.0, floor 29.7), thermal bridging 0.15 × 194.1 m² = 29.1, ventilation 0.33 × 1.0 × 236.25 = 78.0. With the cavity as built (U 1.5), H = 341 W/K.

**The pre-1900 mid-terrace** (87 m², two storeys, aspect 2.0, two party walls, room height 2.7 m, band A):
- footprint 43.5 m²: width 4.664 m, depth 9.327 m;
- the two party walls leave front and back, so the exposed perimeter is 9.327 m;
- wall height 2.7 + 2.95 = 5.65 m, so gross wall 52.70 m²;
- windows 0.122 × 87 + 6.875 = 17.49 m², door 1.85 m², net wall 33.36 m²;
- party walls 2 × 9.327 × 5.65 = 105.40 m², volume 245.78 m³;
- suspended timber floor, w = 0.22 m: B = 9.327, dg = 0.535, Ug = 0.404, Ux = 0.0965 + 0.1166 = 0.213, U = 1 ÷ (0.34 + 0.2 + 1 ÷ 0.617) = 0.46.

At the same floor area, a mid-terrace has less exposed wall than an end-terrace, and a test checks it.

## Checks against outside references

- **Solar geometry** (accepted by Magnus on 18 October 2026 in place of a published vertical-wall example): Duffie and Beckman's Example 1.6.1 (beam incidence of 35° on a 45° surface facing 15° west of south, Madison, 13 February, 10:30) and Example 1.6.2 (zenith angles of 66.5° and 79.6°), to within 2%. A south wall at an equinox noon receives beam at cos θ = sin(latitude), exactly. London's midsummer noon sun sits at 61.9°.
- **The HEM check:** the engine is given HEM's own element areas and inputs for the benchmark archetype (values copied from `scripts/benchmark/draftValues.ts`, not derived geometry, so both sides describe the same house), with no party wall loss, thermal bridging or curtains, as HEM's input has none. Run at 17.8 °C air on the PVGIS weather, it gives 12,999 kWh of annual space heat. That is 4.8% below HEM's `thermostat-17` run (13,660 kWh), inside the 10% regression guard, and the test pins 12,999 kWh. Phase 1's check gave 12,847 kWh (6.0% below); SAP's 0.9 for non-normal incidence on solar gains accounts for the difference. The fixture uses a solar access factor of 1, because the HEM input has no overshading.

- **Roof solar against PVGIS's PV calculator** (19 October 2026). The reference system and the 8% tolerance were committed before PVcalc was called (`scripts/pvgis/pvcalcCheck.ts`): central London, PVGIS-SARAH3 with the horizon, crystalline silicon, 4 kWp, 35°, facing south, a 14% system loss (the register's default, so it cancels out of the gap) and free-standing mounting, to match the NOCT module temperature. PVGIS's `seriescalc` returns only real years, and its typical-year tool returns weather without PV output, so neither gives PV output on the typical year, and the tolerance stays at 8% rather than 5%. `scripts/pvgis/pvcalcCheck.test.ts` runs the check on the committed register, typical year and PVcalc snapshot.

  | What | PVcalc (2005–2023 average) | The engine (typical year) |
  | --- | ---: | ---: |
  | Irradiation on the panel | 1,261 kWh/m² (non-isotropic sky) | 1,178 kWh/m² (isotropic sky), −6.6% |
  | Reflection at the glass | −3.1% | not modelled |
  | Spectral effects | +1.9% | not modelled |
  | Temperature (and low irradiance, for PVcalc) | −4.8% | −2.0% |
  | System loss | −14% | −14% |
  | **Annual yield** | **4,075 kWh** | **3,971 kWh, −2.55%** |

  The engine sits 2.55% below PVcalc, inside the tolerance. Most of the gap is irradiance on the panel, where the typical year and the isotropic sky (which understates the brightness around the sun on a tilted plane) both count; separating them would need a further PVGIS download of multi-year horizontal irradiation. The missing reflection loss and the smaller temperature loss work the other way. No row was changed after the check, and the test pins the gap.

- **The heat pump curve against the Electrification of Heat trial** (19 October 2026; a check, not a fit). Against the trial's published interim analysis report (Energy Systems Catapult, 2023), with the 1930s semi at its central values and k solved on the reference run:

  | What | The trial | The engine | Reading |
  | --- | --- | --- | --- |
  | The coldest day's COP as a share of the year's SPF | 2.44 ÷ 2.80 = 0.87 (medians; coldest day −0.4 °C mean, n = 484; SPFH4, n = 291) | 0.80–0.83 on the five typical-year days with a mean of −1.5 to 0.7 °C | The curve is a little steeper with outdoor temperature than the trial |
  | Mean flow temperature | 38.3 °C, the mean while running, over the year, including hot water | 38.2 °C heat-weighted for space heating, 40.6 °C including hot water | In line |
  | The year's efficiency against flow temperature | Mean SPFH4 about 2.9 for mean flows of 25–35 °C and about 2.5 for 45–55 °C, so about −0.7% per K (between installations, Figure 8.7) | Moving the whole compensation line by ±10 K at the same k gives SPF 3.34 and 2.43 from 2.80, about −1.5% per K | Steeper than the trial's comparison between homes, flatter than HeatpumpMonitor.org's (−3.1% per K of mean space heating flow across 249 systems, 19 October 2026) |

  The two comparisons between installations mix flow temperature with everything else that differs between homes, so neither is a clean slope. The engine sits between them. On the coldest days it uses somewhat more electricity than the trial suggests, which counts against any control that shifts running into cold hours. The rows were not changed after this check.

  **Against the final report and the daily dataset** (19 October 2026). Magnus downloaded the trial's final heat pump performance report and its daily dataset (UK Data Service SN 9210, under its end user licence). Both are kept outside git; only the aggregate figures below are recorded.
  - **The final report:** median ASHP SPFH4 2.78 (n = 428, interquartile range 2.55–3.05), consistent with the register's 2.8. Median COP(H2) is 3.50 at a 35 °C flow and 2.38 at 55 °C, a ratio of 0.68. The engine's shape gives 0.71 for the same two flows at 5 °C outdoors, so the flow response matches.
  - **The daily dataset:** 475 air source heat pumps with at least 330 consecutive-day pairs. Hybrids and ground source are excluded; the median SPFH4 is 2.75. Each day's COP(H4), from the differences of the cumulative meters, is divided by that home's SPF. Only days with at least 5 kWh of heat are used, and the results are binned by the day's mean outdoor temperature. The engine side runs the same method on four archetypes × 20 samples for the row with no standby, and ten archetypes × 20 samples for the row with the standby share.

    | Day's mean outdoor | −2 to 0 °C | 2 to 4 °C | 6 to 8 °C | 10 to 12 °C | 14 to 16 °C | 18 to 20 °C |
    | --- | ---: | ---: | ---: | ---: | ---: | ---: |
    | Trial: daily COP ÷ SPF (median) | 0.87 | 0.98 | 1.09 | 1.10 | 0.93 | 0.89 |
    | Engine, with no standby | 0.79 | 0.89 | 1.01 | 1.13 | 1.14 | 1.14 |
    | Engine, with the standby share | 0.83 | 0.93 | 1.03 | 1.09 | 1.01 | 0.97 |

    **With no standby, the engine was too optimistic in mild weather and, because the year is scaled to the SPF, too pessimistic in cold weather.** On days with almost no heat, the trial's systems still draw a median of 0.56 kWh a day (controls, pumps, standby), inside the H4 boundary, and an engine that spreads all electricity in proportion to heat makes low-heat days look too efficient. Magnus chose to add standby as a share of electricity (19 October 2026). With it, the engine is within 5% on the coldest days and 6–9% on mild ones. It is still a little optimistic in mild hours, partly because small houses get less standby in kWh, so time-of-use tariffs with afternoon cheap periods may be flattered slightly. A larger lift allowance would flatten the cold end only a little and was not changed.

## The 1930s semi's central results

With every row at its default (16.3 °C, filled cavity walls, 100 mm of loft insulation, 3 occupants), on the London typical year:

| | Space heat | Hot water | Gas | Electricity | Cost | Carbon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gas boiler | 9,404 kWh | 1,882 kWh | 13,277 kWh | 2,586 kWh | £2,047 | 2,801 kg |
| Heat pump | 9,404 kWh | 2,429 kWh | 0 | 6,726 kWh | £1,970 | 968 kg |

With roof solar (3.85 kWp, the roof's maximum, generating 3,818 kWh), on imports only and with no export income yet:

| | Electricity used | Of which from solar | Exported | Imported | Cost | Carbon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gas boiler with solar | 2,586 kWh | 1,127 kWh (30% of generation) | 2,691 kWh | 1,459 kWh | £1,751 | 2,639 kg |
| Heat pump with solar | 6,726 kWh | 1,547 kWh (41%) | 2,271 kWh | 5,179 kWh | £1,563 | 746 kg |

The heat pump uses more of the generation: its space heating and standby take 240 kWh, mostly in spring and autumn, and its cylinder reheats 192 kWh; base use takes 1,115 kWh in both. Solar meets standby with space heating, before the cylinder, because standby runs whatever the heat pump is doing.

These are central values only, measured on 19 October 2026 and not pinned by a test: rerun the engine if a price, SPF, carbon or base-use row changes. The gas setup's electricity includes 86 kWh of boiler pump and fan electricity, which adds about £24 to its bill; the heat pump's hot water is the cylinder's reheats, including its standing loss. The ranges, the paired comparison and the sensitivity table are in the [phase 1 report](../reports/phase-1-london-semi.md). The heat pump's small cost margin sits inside a known low bias on heat pump cost: one calibrated temperature applies to both setups ([#15](https://github.com/mannepanne/energy-sim/issues/15)). Gas use matches the calibration target (see [register.md](./register.md#the-mean-internal-temperature-calibration)).

## The archetype table

`npm run archetypes` prints each archetype's central and sampled (200 samples, seed 1) gas use and running costs on the price cap, next to its two pre-registered NEED readings, its gap and the flag. The readings, the rule and the reasons for them are in [scripts/archetypes/README.md](../scripts/archetypes/README.md), committed before any archetype was run. The logic is in `scripts/archetypes/table.ts`.

As a dated snapshot on 18 October 2026 (rerun `npm run archetypes` for current figures; the gaps are not pinned, but the set of flagged archetypes is, by a test in `scripts/archetypes/table.test.ts`), with the default answers Magnus chose (filled cavity walls for bands C–G), nine archetypes sat inside or within 13% of their interval:
- the bungalow was 2% above it and the 1967–75 mid-terrace 3% above;
- the 2007–11 semi was 1% below and the 2012 onwards mid-terrace 13% below;
- the pre-1900 end-terrace was 39% above, so it is **flagged**.

The end-terrace's solid brick walls (U 1.7, as built) cover more exposed wall than any other archetype for its floor area, which RdSAP's solid wall U-value may overstate. With unfilled cavities as the default, the first table instead flagged the 2012 onwards mid-terrace (28% below). Every archetype uses the same behaviour rows, calibrated on the 1930s semi alone, so these gaps are evidence on [#14](https://github.com/mannepanne/energy-sim/issues/14), not targets. The phase 2 report will carry the table, at 200 samples.

## Time base

`calendar.ts` holds the time base; the reasons are in the [time-base ADR](./decisions/2026-10-18-time-base-utc-engine-local-schedules.md).
- **Engine hours** are UTC hours 0–8,759 of the PVGIS typical year.
- **Local time** is UTC + 1 from 01:00 UTC on the last Sunday in March to 01:00 UTC on the last Sunday in October, on the reference year 2026: 29 March and 25 October. On 29 March local 01:00 has no engine hour; on 25 October it has two.
- **Weekdays** come from the reference year: 1 January is a Thursday, as in 2026, and a local day's weekday comes from its local date. Both clock changes therefore fall on Sundays, as they really do.
- **Profiles:** `expandWeekly(values, calendar)` turns an `hour-of-week` profile (168 values, Monday 00:00 local first) into 8,760 engine-hour values; `expandDaily` does the same for 24 values.
- **Agile:** `typicalYearHalfHour(utc)` matches a real half-hour to the typical year by month, day and time, and returns undefined for 29 February. `hourlyFromHalfHourly` averages each engine hour's two half-hours.

- **Months:** `expandMonthly(values, calendar)` turns a `month` profile (12 values) into engine-hour values by local date.

The hot water draw-off and base electricity profiles use the calendar; the schedules and tariffs PRs will too.

## Ranges, the paired comparison and sensitivity

The engine turns register ranges into result ranges by sampling. The [phase 1 report](../reports/phase-1-london-semi.md) shows the results.

```typescript
const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access)); // once
const run = runSetups(access, weather, { seed: 1, count: 500 }); // options: house, spfScenario, setups (default all four)
const comparison = compare(run); // bands, paired differences against gas, the share cheapest, payback and solar's own payback
const tables = sensitivity(access, weather); // one table per pair in SENSITIVITY_PAIRS
```

### Sampling

- **What is sampled:** the uncertain rows in `UNCERTAIN_ROW_IDS` that the house reads under its SPF scenario (21 of the 23: each scenario reads its own SPF and standby share), plus any uncertain table cell the house reads (none in the register yet). Every run reads every one of them, whichever setups it runs, so runs of different setups pair sample by sample. That includes the three solar rows (size, usable roof share and direction) and the capital rows (installed costs, lifetimes and the two price changes). `uncertainDraws(access, house, spfScenario)` lists them, and `sampleOverrides(access, plan, house, spfScenario)` draws them. Every other row is fixed. The fabric quality factor is one shared multiplier, so fabric uncertainty is not averaged away.
- **Correlated rows:** a Gaussian copula pairs the rows named by each `correlation` row. The anchor (the first row named) keeps its own uniform u_a. The partner's normal score becomes z = ρ Φ⁻¹(u_a) + √(1 − ρ²) Φ⁻¹(u_p), and its uniform is Φ(z), clipped to the same open interval as every other uniform. So ρ is a correlation of normal scores; the correlation of the drawn values is slightly lower. Rows outside a pair keep their own independent draws. Φ is Hart's double-precision approximation (as given by West, 2005). There are two pairs, both estimates: the per-occupant gains and hot water terms, at 0.5, and the gas and electricity real price changes, at 0.6. A test checks the sample correlation within 0.05 of ρ over 100,000 draws.
- **Stable draws:** each value comes from its own uniform number, `u = (hash32("seed|sample|rowId") + 0.5) ÷ 2³²`, so u is never 0 or 1. An uncertain table cell uses `rowId|key` in place of the row id. `hash32` is FNV-1a followed by the murmur3 finaliser, in plain TypeScript, so it runs in the browser too. Because a draw depends only on (seed, sample, row id), adding or reordering rows never moves another row's draws. A test pins some hash values, so a change to the hash fails loudly.
- **Inverse distribution functions:** a triangular row uses its default as the mode. A lognormal row gives `median × exp(sigma × Φ⁻¹(u))`, clipped to its low and high, with Φ⁻¹ from Acklam's approximation (relative error below 1.2 × 10⁻⁹). A row whose low equals its high always returns its default.
- **Memory:** `runSetups` keeps only the annual totals for each setup and sample (space heat, hot water, gas, electricity, generation, import, export, the gas and electricity parts of the cost, cost, carbon and upfront cost) in one `Float64Array` per metric, and each sample's capital costs, price scenario and PV size once, shared by every setup. Each full result holds about 560 KB of hourly arrays, so these are dropped straight away.
- **Speed:** 500 samples take about 1.5 seconds for the two setups without solar and about 3 seconds for all four (19 October 2026). `npm run bench` times both, and CI fails above 5 seconds.

### Summaries

- **Central** is the run with every row at its default. **Median** and **P10–P90** come from the samples, by linear interpolation between ranked values (Hyndman and Fan's type 7, the default in R and NumPy). The triangular modes are not medians, so the central value can differ from the median, and can even fall outside the band. The report says so when it does.
- **The paired differences** are the reference (`gas`) minus each other setup, sample by sample, for running cost and for carbon. Positive means the setup is cheaper or emits less.
- **The share cheapest** is the share of samples in which each setup has the lowest running cost of the setups run. Setups tied for the lowest in a sample split it equally, so the shares sum to 1. With two setups, an exact tie counts as half. At 500 samples the 95% margin is about ±4 percentage points, so the report rounds the share to 5% and states the margin. The tariffs PR adds the share within each tariff and across all ten combinations.
- **Payback** is summarised for each setup against the reference, and for solar's own payback on each heating system run both with and without solar (see "Costs, grants and payback").

### Sensitivity

`sensitivity` gives one table per pair of setups. By default the pairs are `SENSITIVITY_PAIRS`: each setup against the reference, and `heatPumpSolar` against `heatPump` (solar against no solar on the heat pump; `gasSolar` against `gas` is already among the first three). A gas-minus-heat-pump swing can't show roof direction, which cancels when both setups have solar, so the solar pairs are where it shows.

- **Each row moves alone,** at its low and then its high value, with every other row at its default. Correlations are ignored.
- **The swing** is the change in the pair's running-cost difference (baseline minus setup) from the low end to the high end. Rows are ranked by its size, largest first. Swings within £0.000001 count as a tie and are ordered by row id, so floating-point noise never decides the order. Base electricity use, for example, moves gas and the heat pump equally and drops out of their difference.
- **Only rows the pair reads are listed.** `runningCostReads(setup, id)` says which rows can change a setup's running cost: the heat pump's SPF, standby share and flow temperatures only for heat pump setups, the boiler's efficiency only for gas setups, the roof solar rows only for solar setups, and every other engine row for all four. A row is listed if either setup in the pair reads it. Capital rows (costs, lifetimes and price changes) never change a year's running cost, so no table lists them. `setups.test.ts` checks that every row a setup is said not to read leaves its cost unchanged.
- A lognormal row's low and high are its clip limits (for the SPF, about its 1st and 99th percentiles), so its row shows an extreme spread.
- **Each value is simulated once** for all the setups the pairs need.

## The report

`npm run report` writes `reports/phase-1-london-semi.md` from the register and the PVGIS snapshot. The logic is in `scripts/report/build.ts` (`buildReport(register, snapshot, plan)`), and number formatting in `scripts/report/format.ts`.

- **Offline and byte-identical.** It reads only committed files, never the clock or the locale, and writes `\n` line endings. Formatting groups thousands by hand and writes minus as U+2212, so the output does not depend on the machine.
- **Rounding:** costs to £10, energy to 100 kWh, carbon to 10 kg and shares to 5%.
- **Method settings:** seed 1 and 500 samples (`REPORT_PLAN`). They are settings of the method, not facts about the house, so they live in code rather than the register.
- **Data dates:** the register's status counts and check dates, the snapshot's fetch date, and every row that needs refreshing with the date it falls due (see `dueDate` in [register.md](./register.md#integrity-rules)). No "today" is used, so the committed report never goes stale by itself. `npm run report` prints overdue rows as console warnings instead.
- **The no-loft variant** is the 1930s semi with the loft answer `none`. It gets a short section with its own paired run on the same samples. The report stays a phase 1 report on the phase 2 engine until the phase 2 report replaces it.
- **CI** regenerates the report and fails if it differs from the committed copy. After changing a register row, run `npm run report` and commit the result.
- **Unescaped text.** Register and snapshot strings, such as labels and the PVGIS attribution, go into the Markdown as they are. That is safe for committed data. If phase 3 renders them as HTML, they must go through an escaping renderer.

## Known simplifications

The phase 1 and phase 2 specs list these as technical debt:
- no thermal mass, and continuous heating to one temperature;
- one calibrated temperature for both setups and every archetype, which may also absorb fabric error ([#14](https://github.com/mannepanne/energy-sim/issues/14));
- fixed weather and an annual average grid carbon factor; prices change only through one real change a year for each fuel, drawn per sample;
- undiscounted payback, a boiler that needs replacing now, installed costs at today's real prices for replacements, and no inverter replacement for PV ([#37](https://github.com/mannepanne/energy-sim/issues/37));
- one installed heat pump cost for every archetype, whatever its heat loss, and one PV cost per kWp whatever the system's size;
- one flat export rate, and no carbon credit for export ([#34](https://github.com/mannepanne/energy-sim/issues/34));
- roof solar on one slope facing between south-east and south-west, with an isotropic sky, no reflection or spectral losses, no shading and no inverter clipping; east–west roofs using both slopes are not modelled;
- base electricity is one weekly shape × a month level from profile class 1 (2013/14), which keeps the winter–summer level but not the small change of daily shape between seasons; the class includes some electric heating, which raises winter use against summer, so solar self-consumption may be slightly understated;
- the heat pump's COP curve is an approximate shape scaled to the field SPF, with no capacity limit and no backup heater;
- the cylinder is one stored-energy state, not a stratified tank, with no immersion backup and no legionella cycle;
- constant internal gains, and windows split equally over four orientations;
- the air change rate is an estimate by age band, not RdSAP's ventilation worksheet ([#27](https://github.com/mannepanne/energy-sim/issues/27));
- window areas use the RdSAP 2012 formula, because RdSAP 10 has none ([#26](https://github.com/mannepanne/energy-sim/issues/26));
- weekdays are taken from the 2026 reference year, not from each month's source year ([#25](https://github.com/mannepanne/energy-sim/issues/25));
- only two pairs are correlated: the per-occupant gains and hot water terms (an estimated 0.5) and the gas and electricity price changes (an estimated 0.6).
