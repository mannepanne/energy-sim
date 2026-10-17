# HEM benchmark run

This folder holds benchmark step 2: a run of the government's Home Energy Model (HEM) for the phase 1 archetype. The plan is in [SPECIFICATIONS/01-engine-core.md](../../../SPECIFICATIONS/01-engine-core.md), section "Benchmark".

## Agreed before the run (17 October 2026)

This section was written and committed before HEM was run on the archetype. It fixes what counts as the answer, so the answer can't be chosen afterwards.

- **The quantity compared** is annual space heat in kWh for the main case (100 mm of loft insulation). For HEM it is the annual sum of the zone's space heat demand, in the HEM results summary. The house is one zone, so no summing across zones is needed.
- **The heating system** in the HEM input is an instant electric heater large enough never to run out of capacity. That makes HEM's delivered space heat equal to its demand, so boiler efficiency doesn't enter the comparison.
- **The thermostat** is 18 °C in every hour of the year, matching the continuous mean internal temperature of the rough calculation and of the phase 1 engine.
- **Matched inputs:** floor area, volume, element areas, U-values, window g-value and frame fraction, internal gains (450 W constant) and location.
- **Inputs HEM models its own way:** solar gains (from window orientation and hourly weather), ventilation (from an air-permeability figure chosen to give about 1 air change an hour), ground-floor heat loss and thermal mass. Differences from these are part of what the benchmark measures.
- **Weather:** the PVGIS typical meteorological year for central London (51.507, −0.128), as an EPW file. The phase 1 engine uses the same PVGIS source.
- **HEM version:** the Rust implementation `communitiesuk/epb-home-energy-model` at commit `77590b6181ef0a6dba4f9e792864e919ccd29a78` (version 1.0.0-alpha-7). Its README calls it functionally incomplete compared with the Python reference, so its result carries that caveat.
- **Time box:** two working days, starting 17 October 2026, 14:48.

## How to reproduce the run

1. Install Rust with [rustup](https://rustup.rs), then clone and build HEM at the commit above:
   ```bash
   git clone https://github.com/communitiesuk/epb-home-energy-model.git
   cd epb-home-energy-model && git checkout 77590b6181ef0a6dba4f9e792864e919ccd29a78
   cargo build --release --locked --features="clap indicatif"
   ```
2. Download the weather file and check its hash:
   ```bash
   curl -o london_tmy.epw "https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=51.507&lon=-0.128&outputformat=epw"
   shasum -a 256 london_tmy.epw
   ```
   The file used on 17 October 2026 had SHA-256 `2de55c5ec68e3af0c7eaa727d0a690b169afcc1db92e1a72141879b770a735ae`. PVGIS may change its typical year between versions, so a different hash means slightly different weather.
3. Regenerate the input files with `npm run benchmark:hem-input` (they are committed in this folder), then run each one:
   ```bash
   target/release/hem path/to/main.input.json -e path/to/london_tmy.epw --heat-balance
   ```
4. Read "Space heat demand" (kWh/m²) in the `__core__results_summary.csv` output, and multiply by 90 m². Record it in `HEM_RESULTS` in `comparison.ts`, then run `npm run benchmark:tables` and update the benchmark README.

## Results (17 October 2026)

The results table is in the [benchmark README](../README.md#step-2-hem-run), generated from `HEM_RESULTS` in `comparison.ts`. The pre-registered answer is 15,455 kWh, with the rough calculation 15.7% below it.

HEM's own heat transfer coefficient for the main case is 303 W/K, against the rough calculation's 302 W/K, so the two describe the same house. Over the year, HEM's ventilation heat loss works out at about 0.89 air changes an hour, against the draft 1.0.

### Why HEM comes out higher

**HEM's thermostat controls operative temperature, not air temperature.** Operative temperature is roughly the average of the air and the room surfaces. In a poorly insulated house the walls and windows are cold, so HEM heats the air to about 18.8 °C, on average over heating hours, to make the room feel like 18 °C. The rough calculation and the phase 1 engine treat 18 °C as the air temperature.

At a 17 °C thermostat, HEM's air averages 17.8 °C over heating hours, close to the rough calculation's 18 °C. HEM then gives 13,660 kWh, and the rough figure is 4.6% below it. Each 1 °C on the thermostat changes HEM's answer by about 1,700 kWh (11%).

So the gap is mostly about what "18 °C" means, not a flaw in the method. The 17 °C run closes about 70% of it. Some of the remaining 4.5% may be weather, because the rough calculation uses Heathrow's 1991–2020 monthly means and HEM uses the PVGIS typical year (annual mean 11.1 °C). The engine PR repeats this check with the same weather on both sides, which is the cleaner comparison. This sensitivity was run after the main result was known, so it explains the gap but does not replace the pre-registered answer.

### Annual heat balance for the main case (HEM, kWh)

| Gains | | Losses | |
| --- | ---: | --- | ---: |
| Space heating | 15,455 | Walls, roof and door | 11,124 |
| Solar | 4,761 | Ventilation and infiltration | 5,433 |
| Internal | 3,945 | Windows | 4,738 |
| | | Ground floor | 2,792 |

Solar gains are about 540 W on average over the year, but only about 300 W in the hours when heating runs. The rough calculation's 250 W heating-season figure is in line with that.

### Limitations of this run

- The Rust port is version 1.0.0-alpha-7 and is described by its authors as functionally incomplete. The Python reference was not run.
- Hot water is switched off (a small cylinder with no draw-offs), so this compares space heat only.
- Thermal bridges are left out, as in the rough calculation. A real house of this age would add some heat loss.
- HEM models ventilation, ground heat flow and thermal mass its own way, so those differences are part of the result.
