# The engine

**When to read this:** changing the physics, reading engine results, adding an input, or checking how a number is calculated.

The engine is a pure TypeScript library in `src/engine/`. It reads no files and makes no network calls, so the same code runs in tests, scripts and (in phase 3) the browser. It runs one house with one heating setup over the 8,760 hours of a typical year, using typed arrays rather than an object per hour. Every number it uses comes from the [register](./register.md); only physical constants live in `src/engine/constants.ts`.

What phase 1 builds and why is in the [phase 1 spec](../SPECIFICATIONS/01-engine-core.md). Why the temperature is an air temperature calibrated to measured gas use is in the [calibration ADR](./decisions/2026-10-17-air-temperature-calibrated-to-need.md).

## Files

| File | What it does |
| --- | --- |
| `constants.ts` | Physical constants and unit conversions: hours in a year, 0.33 Wh/m³K for air, 4.18 kJ/kgK for water |
| `inputs.ts` | `readInputs(access, { variant, overrides })`: reads every input from the register into one `EngineInputs` object |
| `weather.ts` | `weatherFromSnapshot(snapshot)` and `prepareWeather(weather, inputs)` |
| `solar.ts` | Sun position, irradiance on a tilted surface, and the hourly mean irradiance on four walls |
| `geometry.ts` | `heatLoss(inputs)`: the heat loss coefficient H |
| `demand.ts` | Solar gains, hourly space heat, and daily hot water |
| `supply.ts` | Fuel for heat (÷ efficiency or SPF), and the cost of a kWh of heat |
| `costCarbon.ts` | Annual cost and carbon |
| `simulate.ts` | `simulate(inputs, preparedWeather, setup)`: one house, one setup, one year |
| `sampling.ts` | Seeded, stable draws: `drawSamples(rows, plan)`, `sampleOverrides(access, plan)` and the inverse distribution functions |
| `compare.ts` | `runPaired(access, weather, plan)` runs both setups on the same samples; `compare(run)` gives the bands, the paired difference and the share of wins |
| `sensitivity.ts` | `sensitivity(access, weather)`: each uncertain row at its low and its high, ranked by its effect on the cost difference |
| `testing/fixtureRegister.ts` | Test support: builds inline fixture registers, starting from the fixture house below |

## Running the engine

```typescript
const access = createAccessor(loadRegister(registerJson));
const inputs = readInputs(access); // the central run: every uncertain row at its default
const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(snapshotJson)), inputs);
const gas = simulate(inputs, weather, 'gas');
const heatPump = simulate(inputs, weather, 'heatPump');
gas.annual.gasKwh; // also spaceHeatKwh, hotWaterKwh, electricityKwh, cost, carbonKg, and hourly arrays
```

- **Variants.** `readInputs(access, { variant: 'noLoftInsulation' })` swaps the main roof U-value for the no-loft-insulation row.
- **Overrides.** `readInputs(access, { overrides: { 'heating.heatPumpSpf': 3.2 } })` replaces an uncertain row's default, and is the hook for sampling. Overrides are typed to the uncertain rows (`UNCERTAIN_ROW_IDS`), and a value that is not a finite number throws.
- **Prepared weather** holds the outdoor temperature and the hourly mean wall irradiance. It depends only on fixed rows, so one preparation serves every sample.
- **Overrides are not user overrides.** The sampling hook follows row kind. The register's `overridable` flag, for what a visitor may change, also covers fixed rows (U-values, prices, cylinder loss), and excludes some uncertain ones (fabric quality factor, internal gains). How user overrides reach the engine is a phase 3 decision (see [SPECIFICATIONS/CLAUDE.md](../SPECIFICATIONS/CLAUDE.md)).
- **Prepared weather must match the inputs.** `simulate` does not check that the weather was prepared with the same sample minute and ground reflectance. Both are fixed rows today; if either becomes uncertain, prepare the weather per sample.
- **Speed.** `simulate` takes about 0.6 ms for a year, and `prepareWeather` about 1.7 ms, run once. So 500 samples × 2 setups take well under a second. Each result holds five hourly arrays (about 350 KB), so a sampler should keep only the annual totals.

## The physics

### Heat loss

```
H = f_fabric × (Σ U·A + 0.33 · n · V)       W/K
```

The elements are the external walls, windows, door, roof and ground floor. Their areas and the heated volume V are geometry rows; their U-values and the air change rate n are fabric rows. The party wall's U-value is 0, so it has no term. `f_fabric` is the fabric quality factor, one shared multiplier on every U-value and on ventilation.

### Space heat at a mean internal temperature

```
Q(t) = max(0, H (T_mean − T_out(t) − offset) − G_solar(t) − G_internal)      for each of 8,760 hours
```

`T_mean` is an **air** temperature, held continuously. The house has no thermal mass. `offset` is the outdoor-temperature offset row (0 for the typical year; tests lower it to build a colder year). The `max(0, …)` clamp means surplus gains in summer never make demand negative. Each hour's mean power in W ÷ 1,000 is its energy in kWh.

### Internal gains

A constant wattage, from the uncertain internal gains row.

### Solar gains

```
G_solar(t) = window area × g-value × frame factor × solar access factor × I_wall(t)
```

`I_wall(t)` is the irradiance on a vertical wall, averaged over walls facing north, east, south and west, because the windows are split equally between them. For each hour and wall:

1. **Sun position** at the hour's UTC time plus the irradiance sample minute row (10 minutes). Declination and the equation of time follow Spencer (1971); hour angle uses the snapshot's longitude. The formulas are Duffie and Beckman's (*Solar Engineering of Thermal Processes*, 4th edition), eqs. 1.5.3, 1.6.1b, 1.6.2 and 1.6.5.
2. **Isotropic sky** (Liu and Jordan; Duffie and Beckman eq. 2.15.1):
   `I = Gb(n) × max(0, cos θ) + Gd(h) × (1 + cos β)/2 + G(h) × ρ × (1 − cos β)/2`.
   For a wall, β = 90°, so it gets half the sky diffuse and, at ρ = 0.2, a tenth of the global horizontal. The beam counts only when the sun is above the horizon. θ is the angle between the sun and the wall's normal.

**Why 10 minutes past the hour.** PVGIS labels each hour HH:00. The 10 minutes is inferred from the data, not taken from PVGIS documentation. Beam and diffuse must add up to global: `Gb(n) × cos(zenith) + Gd(h) = G(h)`. Over the London snapshot the mismatch is 1.5% of annual global irradiance with the sun at HH:00, 0.24% at HH:10, and 2.6% at HH:30. A test repeats this check. It guards the sun position, the equation of time and the UTC handling together.

On the London snapshot, mean wall irradiance is about 74 W/m², so the register house gains about 450 W of solar heat on average over the year.

### Hot water

```
Q_dhw per day = L × 4.18 × (T_delivery − T_cold) ÷ 3,600 + cylinder loss      kWh
```

L is litres a day (uncertain). The gas setup is a combi boiler, so it has no cylinder loss. The heat pump setup adds the cylinder standing loss row. Daily hot water is spread evenly over the 24 hours, which makes no difference on a flat tariff.

### Supply

- **Gas:** gas kWh = (space heat + hot water) ÷ boiler seasonal efficiency, hour by hour.
- **Heat pump:** electricity kWh = (space heat + hot water + cylinder loss) ÷ SPF. The SPF row includes hot water, so one figure covers both. Capacity is unlimited and there is no backup heater.
- **Base electricity** (lights and appliances) is the same in both setups, spread evenly over the year. The boiler's own pump and fan electricity is left out.

### Cost and carbon

- Cost = kWh × unit rate + standing charges, at the flat price cap. Both setups pay the electricity standing charge. **The heat-pump-only house has no gas supply, so it pays no gas standing charge.**
- Carbon = gas kWh × gas factor + electricity kWh × the annual average grid factor.

## The fixture house

Engine tests use small inline registers, built by `fixtureRegister(values)`, so they never depend on `data/register.json`. The base values describe a house with round numbers, chosen so every result can be worked by hand. `geometry.test.ts` and `simulate.test.ts` reproduce these figures.

**Heat loss coefficient:**

| Element | Area (m²) | U (W/m²K) | U × A (W/K) |
| --- | ---: | ---: | ---: |
| External walls | 100 | 1.0 | 100 |
| Windows | 10 | 3.0 | 30 |
| Door | 2 | 2.5 | 5 |
| Roof | 50 | 0.5 | 25 |
| Ground floor | 50 | 0.8 | 40 |
| **Fabric** | | | **200** |
| Ventilation: 0.33 × 0.8 ach × 250 m³ | | | **66** |
| **H** (fabric quality factor 1) | | | **266** |

At a fabric quality factor of 0.9, H = 239.4 W/K. With the no-loft-insulation roof (U = 2.0), H = 266 + 50 × 1.5 = 341 W/K.

**A year at a constant 5 °C with no sun**, heated to 20 °C, with 400 W of internal gains:

| Quantity | Working | Result |
| --- | --- | ---: |
| Space heat each hour | (266 × (20 − 5) − 400) ÷ 1,000 | 3.59 kWh |
| Space heat a year | 3.59 × 8,760 | 31,448.4 kWh |
| Hot water a day | 100 L × 4.18 × (50 − 10) ÷ 3,600 | 4.644 kWh |
| Hot water a year | 4.644 × 365 | 1,695.2 kWh |
| Gas (boiler 0.8) | (31,448.4 + 1,695.2) ÷ 0.8 | 41,429.5 kWh |
| Gas setup cost | 41,429.5 × 8p + 30p × 365 + 2,920 × 25p + 50p × 365 | £4,336.36 |
| Heat pump heat | 31,448.4 + (4.644 + 1.5) × 365 | 33,691.1 kWh |
| Heat pump electricity (SPF 2.5) | 33,691.1 ÷ 2.5 + 2,920 base | 16,396.5 kWh |
| Heat pump setup cost | 16,396.5 × 25p + 50p × 365 | £4,281.61 |

## Checks against outside references

- **Solar geometry** (accepted by Magnus on 18 October 2026 in place of a published vertical-wall example): Duffie and Beckman's Example 1.6.1 (beam incidence of 35° on a 45° surface facing 15° west of south, Madison, 13 February, 10:30) and Example 1.6.2 (zenith angles of 66.5° and 79.6°), to within 2%. A south wall at an equinox noon receives beam at cos θ = sin(latitude), exactly. London's midsummer noon sun sits at 61.9°.
- **The HEM check:** an inline fixture register matching the benchmark archetype (values copied from `scripts/benchmark/draftValues.ts`), run at 17.8 °C air on the PVGIS weather, gives 12,847 kWh of annual space heat. That is 6.0% below HEM's `thermostat-17` run (13,660 kWh), inside the 10% regression guard. The fixture uses a solar access factor of 1, because the HEM input has no overshading. With the register's 0.77 it gives 13,217 kWh (3.2% below).

## The register house's central results

With every row at its default (15.7 °C, the main case), on the London typical year:

| | Space heat | Hot water | Gas | Electricity | Cost | Carbon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gas boiler | 9,461 kWh | 1,695 kWh | 13,124 kWh | 2,500 kWh | £2,012 | 2,761 kg |
| Heat pump | 9,461 kWh | 2,243 kWh | 0 | 6,680 kWh | £1,958 | 962 kg |

These are central values only, measured on 18 October 2026 and not pinned by a test: rerun the engine if a price, SPF, carbon or base-use row changes. The ranges, the paired comparison and the sensitivity table are in the [phase 1 report](../reports/phase-1-london-semi.md). The heat pump's small cost margin sits inside a known low bias on heat pump cost: one calibrated temperature applies to both setups ([#15](https://github.com/mannepanne/energy-sim/issues/15)). Gas use matches the calibration target (see [register.md](./register.md#the-mean-internal-temperature-calibration)).

## Ranges, the paired comparison and sensitivity

The engine turns register ranges into result ranges by sampling. The [phase 1 report](../reports/phase-1-london-semi.md) shows the results.

```typescript
const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access)); // once
const run = runPaired(access, weather, { seed: 1, count: 500 }); // optional fourth argument: 'noLoftInsulation'
const comparison = compare(run); // bands for each setup, the paired difference and the share of wins
const table = sensitivity(access, weather);
```

### Sampling

- **What is sampled:** the seven uncertain rows in `UNCERTAIN_ROW_IDS`. Every other row is fixed. The fabric quality factor is one shared multiplier, so fabric uncertainty is not averaged away; the other rows are drawn independently ([#20](https://github.com/mannepanne/energy-sim/issues/20)).
- **Stable draws:** each value comes from its own uniform number, `u = (hash32("seed|sample|rowId") + 0.5) ÷ 2³²`, so u is never 0 or 1. `hash32` is FNV-1a followed by the murmur3 finaliser, in plain TypeScript, so it runs in the browser too. Because a draw depends only on (seed, sample, row id), adding or reordering rows never moves another row's draws. A test pins some hash values, so a change to the hash fails loudly.
- **Inverse distribution functions:** a triangular row uses its default as the mode. A lognormal row gives `median × exp(sigma × Φ⁻¹(u))`, clipped to its low and high, with Φ⁻¹ from Acklam's approximation (relative error below 1.2 × 10⁻⁹). A row whose low equals its high always returns its default.
- **Memory:** `runPaired` keeps only the annual totals for each sample (space heat, hot water, gas, electricity, cost, carbon) in one `Float64Array` per metric. Each full result holds about 350 KB of hourly arrays, so these are dropped straight away.
- **Speed:** 500 samples × 2 setups take about 0.6 seconds. `npm run bench` times it, and CI fails above 5 seconds.

### Summaries

- **Central** is the run with every row at its default. **Median** and **P10–P90** come from the samples, by linear interpolation between ranked values (Hyndman and Fan's type 7, the default in R and NumPy). The triangular modes are not medians, so the central value can differ from the median, and can even fall outside the band. The report says so when it does.
- **The paired difference** is gas minus heat pump, sample by sample, for cost and for carbon. Positive means the heat pump is cheaper or emits less.
- **The share of wins** is the share of samples in which the heat pump costs less. An exact tie counts as half. At 500 samples the 95% margin is about ±4 percentage points, so the report rounds the share to 5% and states the margin.

### Sensitivity

`sensitivity` runs each uncertain row at its low and then its high value, with every other row at its default, for both setups. Rows are ranked by the swing in the cost difference (gas minus heat pump), largest first. Swings within £0.000001 count as a tie and are ordered by row id, so floating-point noise never decides the order. Base electricity use, for example, moves both costs equally and drops out of the difference. A lognormal row's low and high are its clip limits (for the SPF, about its 1st and 99th percentiles), so its row shows an extreme spread.

## The report

`npm run report` writes `reports/phase-1-london-semi.md` from the register and the PVGIS snapshot. The logic is in `scripts/report/build.ts` (`buildReport(register, snapshot, plan)`), and number formatting in `scripts/report/format.ts`.

- **Offline and byte-identical.** It reads only committed files, never the clock or the locale, and writes `\n` line endings. Formatting groups thousands by hand and writes minus as U+2212, so the output does not depend on the machine.
- **Rounding:** costs to £10, energy to 100 kWh, carbon to 10 kg and shares to 5%.
- **Method settings:** seed 1 and 500 samples (`REPORT_PLAN`). They are settings of the method, not facts about the house, so they live in code rather than the register.
- **Data dates:** the register's status counts and check dates, the snapshot's fetch date, and every row that needs refreshing with the date it falls due (see `dueDate` in [register.md](./register.md#integrity-rules)). No "today" is used, so the committed report never goes stale by itself. `npm run report` prints overdue rows as console warnings instead.
- **The no-loft variant** gets a short section with its own paired run on the same samples. `sensitivity` also takes an optional variant.
- **CI** regenerates the report and fails if it differs from the committed copy. After changing a register row, run `npm run report` and commit the result.
- **Unescaped text.** Register and snapshot strings, such as labels and the PVGIS attribution, go into the Markdown as they are. That is safe for committed data. If phase 3 renders them as HTML, they must go through an escaping renderer.

## Known simplifications

The phase 1 spec lists these as technical debt:
- no thermal mass, and continuous heating to one temperature;
- one calibrated temperature for both setups, which may also absorb fabric error;
- fixed prices, fixed weather and an annual average grid carbon factor;
- one SPF for the year, no heat pump capacity limit and no backup heater;
- no boiler auxiliary electricity;
- constant internal gains, and windows split equally over four orientations;
- uncertain rows other than the fabric quality factor are sampled independently ([#20](https://github.com/mannepanne/energy-sim/issues/20)).
