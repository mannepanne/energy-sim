# The engine

**When to read this:** changing the physics, reading engine results, adding an input, or checking how a number is calculated.

The engine is a pure TypeScript library in `src/engine/`. It reads no files and makes no network calls, so the same code runs in tests, scripts and (in phase 3) the browser. It runs one house with one heating setup over the 8,760 hours of a typical year, using typed arrays rather than an object per hour. A house is one of ten archetypes, adjusted by quick facts. Every number it uses comes from the [register](./register.md); only physical constants and method settings live in code.

What phase 1 built and why is in the [phase 1 spec](../SPECIFICATIONS/ARCHIVE/01-engine-core.md); phase 2's plan is in the [phase 2 spec](../SPECIFICATIONS/02-complete-v1-model.md). Why the temperature is an air temperature calibrated to measured gas use is in the [calibration ADR](./decisions/2026-10-17-air-temperature-calibrated-to-need.md).

## Files

| File | What it does |
| --- | --- |
| `constants.ts` | Physical constants and unit conversions: hours in a year, 0.33 Wh/m³K for air, 4.18 kJ/kgK for water |
| `archetypes.ts` | The archetype keys, the quick-facts answers, `House`, `defaultHouse(access, archetype)`, `wallAnswers` and SAP occupancy |
| `inputs.ts` | `readInputs(access, { house, overrides })`: reads every input for one house into one `EngineInputs` object, deriving geometry and the ground floor U-value; `uncertainDraws(access, house)` lists the uncertain values it reads |
| `weather.ts` | `weatherFromSnapshot(snapshot)` and `prepareWeather(weather, inputs)` |
| `solar.ts` | Sun position, irradiance on a tilted surface, and the hourly mean irradiance on four walls |
| `geometry.ts` | `deriveGeometry(facts)`: element areas and volume; `heatLoss(inputs)`: the heat loss coefficient H |
| `groundFloor.ts` | The ground floor U-value by BS EN ISO 13370, as RdSAP 10 section 5.12 applies it |
| `calendar.ts` | The time base: UTC engine hours to UK local time, weekly and daily profiles, and Agile half-hours (see "Time base") |
| `demand.ts` | Solar gains, hourly space heat, and daily hot water |
| `supply.ts` | Fuel for heat (÷ efficiency or SPF), and the cost of a kWh of heat |
| `costCarbon.ts` | Annual cost and carbon |
| `simulate.ts` | `simulate(inputs, preparedWeather, setup)`: one house, one setup, one year |
| `sampling.ts` | Seeded, stable draws with a Gaussian copula: `drawSamples(rows, plan, correlations)`, `sampleOverrides(access, plan, house)`, the normal CDF and the inverse distribution functions |
| `compare.ts` | `runPaired(access, weather, plan, house)` runs both setups on the same samples; `compare(run)` gives the bands, the paired difference and the share of wins |
| `sensitivity.ts` | `sensitivity(access, weather, house)`: each uncertain row or cell at its low and its high, ranked by its effect on the cost difference |
| `testing/fixtureRegister.ts` | Test support: builds inline fixture registers, starting from the fixture house below |

## Running the engine

```typescript
const access = createAccessor(loadRegister(registerJson));
const house = defaultHouse(access, 'semi1930s'); // or { ...house, loft: 'none', occupants: 2 }
const inputs = readInputs(access, { house }); // the central run: every uncertain row at its default
const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(snapshotJson)), inputs);
const gas = simulate(inputs, weather, 'gas');
const heatPump = simulate(inputs, weather, 'heatPump');
gas.annual.gasKwh; // also spaceHeatKwh, hotWaterKwh, electricityKwh, cost, carbonKg, and hourly arrays
```

- **Houses.** A `House` is an archetype key, a floor area, an occupant count (1–5) and three quick-facts answers: loft (`none`, `about100mm`, `270mmOrMore`), walls (`asBuilt`, `cavityFilled`, `solidWallInsulated`) and glazing (`single`, `olderDouble`, `newerDouble`). `defaultHouse` gives the archetype's defaults. `readInputs` with no house reads the 1930s semi (`REFERENCE_ARCHETYPE`), the house the behaviour rows are calibrated on.
- **Only answers that fit are offered.** `wallAnswers(access, archetype)` lists the wall answers that have a U-value for the archetype's band and construction: solid brick offers `asBuilt` and `solidWallInsulated`, cavity bands C–G offer `asBuilt` and `cavityFilled`, and bands K and L offer `asBuilt` only. `readInputs` throws on any other answer, on a floor area that is not positive, and on an occupant count outside 1–5.
- **Overrides.** `readInputs(access, { overrides: { 'heating.heatPumpSpf': 3.2 } })` replaces an uncertain row's default, and is the hook for sampling. An uncertain table cell is overridden under `rowId|key`. A value that is not a finite number throws, and so does an override the house does not read (a typo, for example).
- **Prepared weather** holds the outdoor temperature and the hourly mean wall irradiance. It depends only on fixed rows, so one preparation serves every sample.
- **Overrides are not user overrides.** The sampling hook follows row kind. The register's `overridable` flag, for what a visitor may change, also covers fixed rows (U-values, prices, cylinder loss), and excludes some uncertain ones (fabric quality factor, internal gains). How user overrides reach the engine is a phase 3 decision (see [SPECIFICATIONS/CLAUDE.md](../SPECIFICATIONS/CLAUDE.md)).
- **Prepared weather must match the inputs.** `simulate` does not check that the weather was prepared with the same sample minute and ground reflectance. Both are fixed rows today; if either becomes uncertain, prepare the weather per sample.
- **Speed.** `simulate` takes about 0.6 ms for a year, and `prepareWeather` about 1.7 ms, run once. So 500 samples × 2 setups take well under a second. Each result holds five hourly arrays (about 350 KB), so a sampler should keep only the annual totals.

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
Q_dhw per day = L × 4.18 × (T_delivery − T_cold) ÷ 3,600 + cylinder loss      kWh
```

L is litres a day: 36 plus an uncertain 25 per occupant (17–35), SAP 2012's 25N + 36. That is 111 litres a day for the 1930s semi's 3 occupants. The per-occupant hot water and gains terms are correlated (see "Sampling"). The gas setup is a combi boiler, so it has no cylinder loss. The heat pump setup adds the cylinder standing loss row. Daily hot water is spread evenly over the 24 hours, which makes no difference on a flat tariff.

### Supply

- **Gas:** gas kWh = (space heat + hot water) ÷ boiler seasonal efficiency, hour by hour.
- **Heat pump:** electricity kWh = (space heat + hot water + cylinder loss) ÷ SPF. The SPF row includes hot water, so one figure covers both. Capacity is unlimited and there is no backup heater.
- **Base electricity** (lights and appliances) is the same in both setups, spread evenly over the year. The boiler's own pump and fan electricity is left out until the heat pump curve PR.

### Cost and carbon

- Cost = kWh × unit rate + standing charges, at the flat price cap. Both setups pay the electricity standing charge. **The heat-pump-only house has no gas supply, so it pays no gas standing charge.**
- Carbon = gas kWh × gas factor + electricity kWh × the annual average grid factor.

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

## The 1930s semi's central results

With every row at its default (16.3 °C, filled cavity walls, 100 mm of loft insulation, 3 occupants), on the London typical year:

| | Space heat | Hot water | Gas | Electricity | Cost | Carbon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gas boiler | 9,404 kWh | 1,882 kWh | 13,277 kWh | 2,500 kWh | £2,025 | 2,789 kg |
| Heat pump | 9,404 kWh | 2,429 kWh | 0 | 6,726 kWh | £1,970 | 968 kg |

These are central values only, measured on 18 October 2026 and not pinned by a test: rerun the engine if a price, SPF, carbon or base-use row changes. The ranges, the paired comparison and the sensitivity table are in the [phase 1 report](../reports/phase-1-london-semi.md). The heat pump's small cost margin sits inside a known low bias on heat pump cost: one calibrated temperature applies to both setups ([#15](https://github.com/mannepanne/energy-sim/issues/15)). Gas use matches the calibration target (see [register.md](./register.md#the-mean-internal-temperature-calibration)).

## The archetype table

`npm run archetypes` prints each archetype's central and sampled (200 samples, seed 1) gas use and running costs on the price cap, next to its two pre-registered NEED readings, its gap and the flag. The readings, the rule and the reasons for them are in [scripts/archetypes/README.md](../scripts/archetypes/README.md), committed before any archetype was run. The logic is in `scripts/archetypes/table.ts`.

As a snapshot on 18 October 2026 (not pinned by a test; rerun `npm run archetypes` for current figures), with the default answers Magnus chose (filled cavity walls for bands C–G), nine archetypes sat inside or within 13% of their interval:
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

No engine module uses the calendar yet; the schedules and tariffs PRs do.

## Ranges, the paired comparison and sensitivity

The engine turns register ranges into result ranges by sampling. The [phase 1 report](../reports/phase-1-london-semi.md) shows the results.

```typescript
const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access)); // once
const run = runPaired(access, weather, { seed: 1, count: 500 }); // optional fourth argument: a House
const comparison = compare(run); // bands for each setup, the paired difference and the share of wins
const table = sensitivity(access, weather);
```

### Sampling

- **What is sampled:** the seven uncertain rows in `UNCERTAIN_ROW_IDS`, plus any uncertain table cell the house reads (none in the register yet). `uncertainDraws(access, house)` lists them, and `sampleOverrides(access, plan, house)` draws them. Every other row is fixed. The fabric quality factor is one shared multiplier, so fabric uncertainty is not averaged away.
- **Correlated rows:** a Gaussian copula pairs the rows named by each `correlation` row. The anchor (the first row named) keeps its own uniform u_a. The partner's normal score becomes z = ρ Φ⁻¹(u_a) + √(1 − ρ²) Φ⁻¹(u_p), and its uniform is Φ(z), clipped to the same open interval as every other uniform. So ρ is a correlation of normal scores; the correlation of the drawn values is slightly lower. Rows outside a pair keep their own independent draws. Φ is Hart's double-precision approximation (as given by West, 2005). The one pair is the per-occupant gains and hot water terms, at 0.5, an estimate. A test checks the sample correlation within 0.05 of ρ over 100,000 draws.
- **Stable draws:** each value comes from its own uniform number, `u = (hash32("seed|sample|rowId") + 0.5) ÷ 2³²`, so u is never 0 or 1. An uncertain table cell uses `rowId|key` in place of the row id. `hash32` is FNV-1a followed by the murmur3 finaliser, in plain TypeScript, so it runs in the browser too. Because a draw depends only on (seed, sample, row id), adding or reordering rows never moves another row's draws. A test pins some hash values, so a change to the hash fails loudly.
- **Inverse distribution functions:** a triangular row uses its default as the mode. A lognormal row gives `median × exp(sigma × Φ⁻¹(u))`, clipped to its low and high, with Φ⁻¹ from Acklam's approximation (relative error below 1.2 × 10⁻⁹). A row whose low equals its high always returns its default.
- **Memory:** `runPaired` keeps only the annual totals for each sample (space heat, hot water, gas, electricity, cost, carbon) in one `Float64Array` per metric. Each full result holds about 350 KB of hourly arrays, so these are dropped straight away.
- **Speed:** 500 samples × 2 setups take about 0.6 seconds. `npm run bench` times it, and CI fails above 5 seconds.

### Summaries

- **Central** is the run with every row at its default. **Median** and **P10–P90** come from the samples, by linear interpolation between ranked values (Hyndman and Fan's type 7, the default in R and NumPy). The triangular modes are not medians, so the central value can differ from the median, and can even fall outside the band. The report says so when it does.
- **The paired difference** is gas minus heat pump, sample by sample, for cost and for carbon. Positive means the heat pump is cheaper or emits less.
- **The share of wins** is the share of samples in which the heat pump costs less. An exact tie counts as half. At 500 samples the 95% margin is about ±4 percentage points, so the report rounds the share to 5% and states the margin.

### Sensitivity

`sensitivity` runs each uncertain row or cell at its low and then its high value, with every other row at its default, for both setups. It ignores correlations: each row moves alone. Rows are ranked by the swing in the cost difference (gas minus heat pump), largest first. Swings within £0.000001 count as a tie and are ordered by row id, so floating-point noise never decides the order. Base electricity use, for example, moves both costs equally and drops out of the difference. A lognormal row's low and high are its clip limits (for the SPF, about its 1st and 99th percentiles), so its row shows an extreme spread.

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
- fixed prices, fixed weather and an annual average grid carbon factor;
- one SPF for the year, no heat pump capacity limit and no backup heater;
- no boiler auxiliary electricity;
- constant internal gains, and windows split equally over four orientations;
- the air change rate is an estimate by age band, not RdSAP's ventilation worksheet ([#27](https://github.com/mannepanne/energy-sim/issues/27));
- window areas use the RdSAP 2012 formula, because RdSAP 10 has none ([#26](https://github.com/mannepanne/energy-sim/issues/26));
- weekdays are taken from the 2026 reference year, not from each month's source year ([#25](https://github.com/mannepanne/energy-sim/issues/25));
- only the per-occupant gains and hot water terms are correlated, at an estimated 0.5.
