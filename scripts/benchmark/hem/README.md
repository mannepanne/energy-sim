# HEM benchmark run

This folder holds benchmark step 2: a run of the government's Home Energy Model (HEM) for the phase 1 archetype. The plan is in [SPECIFICATIONS/ARCHIVE/01-engine-core.md](../../../SPECIFICATIONS/ARCHIVE/01-engine-core.md), section "Benchmark".

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

## Agreed before the scheduled run (20 October 2026)

Phase 2 adds thermal mass and heating periods to the engine, and checks them against HEM under the same schedule ([phase 2 spec](../../../SPECIFICATIONS/02-complete-v1-model.md), "Heating over time"). This section was written and committed before HEM was run on the scheduled inputs. It fixes what counts as the answer, so the answer can't be chosen afterwards.

- **The house:** the phase 1 benchmark house, as above: the draft values in `draftValues.ts`, with HEM's own element areas (heat loss coefficient 302 W/K). The engine side uses the same fixture as the continuous HEM check, in `src/engine/testing/hemCheck.ts`, not the register's semi with derived geometry.
- **The quantity compared:** annual space heat in kWh: HEM's "Space heat demand" in the results summary × 90 m², against the engine's annual space heat. HEM's heater stays the 50 kW instant electric heater and the engine's output cap is off for the check, so on both sides the heat delivered equals the demand. After the run, HEM's delivered space heat is checked to equal its demand to within 1%.
- **The schedule:** SAP's heating periods. Weekdays 07:00–09:00 and 16:00–23:00 (SAP 10.2 Table 9), weekends 07:00–23:00 (SAP's unimodal day, Table N7 note b). Heating is off outside the periods, with no setback and no early start, on both sides.
  - In HEM: a `SetpointTimeControl` with `weekday` and `weekend` blocks, null outside the periods, and a one-hour step (`thermostatSchedule` in `hemInput.ts`).
  - Days of the week: the engine takes them from 2026, when 1 January is a Thursday. HEM's week blocks run from simulation day 0, so the schedule opens with two weekdays and a weekend.
  - Clock time: HEM's year has no British Summer Time. The engine side of the check uses the same hours, on GMT all year, so both sides heat in exactly the same 8,760 hours. (The engine's own runs convert local time with the calendar module; the one-hour summer shift falls mostly outside the heating season.)
- **The setpoint:** HEM's thermostat is 19 °C operative in the heating periods. The engine's setpoint for the check is **19.8 °C air**, from phase 1's measured pair (17 °C operative gave 17.8 °C air, and 18 °C gave 18.8 °C, in this house). HEM's mean air temperature over the hours it heats is reported as a diagnostic only. It does not adjust the engine's setpoint.
- **Thermal mass:** the engine's heat capacity C is SAP's thermal mass parameter × floor area: 250 kJ/m²K (RdSAP 10 Table 22, masonry without internal insulation) × 90 m² = 22,500 kJ/K. In HEM, every building element's areal heat capacity is scaled by one factor (1.217), so that the sum of areal heat capacity × area is the same 22,500 kJ/K. Each element keeps its mass distribution class (`I`, mass at the inside face). SAP's parameter includes internal walls and floors, which HEM's input does not have, so HEM's external and party walls, roof, door and floor carry all of it. HEM's ground model adds its own soil layer, which the engine does not have.
- **The decision run** is `schedule-sap.input.json`. `continuous-sap-mass.input.json` is a diagnostic: the same house and capacity heated in every hour at 19 °C operative. It shows how much of any gap comes from the schedule rather than from the steady-state difference phase 1 found. It doesn't enter the decision.
- **Run settings:** a one-hour step on both sides, over the 8,760 hours of the year, with the same weather file and HEM commit as phase 1. HEM starts from its `temp_setpnt_init` (19 °C). The engine starts each year from the temperature its node reaches over a pre-roll of the year's last 7 days, beginning at the setpoint.
- **The tolerance and the decision rule:** the gap is engine ÷ HEM − 1 on annual space heat.
  - |gap| within 15%: proceed with the one-node engine;
  - 15–30%: build the two-node fallback (air and mass, as in ISO 13790's 5R1C) and compare it with the same HEM result;
  - above 30%: stop and review with Magnus.

  Afterwards, an engine test pins the engine's figure and guards it within 10% of HEM.
- **Time box:** two working days, starting 20 October 2026, 21:05.

## Agreed before the heat pump schedule run (20 October 2026)

The scheduled results below show that the one node's error depends on the heating pattern. Before a heat pump schedule longer than the gas one is used, HEM checks the engine on it. This section was committed before HEM was run on `schedule-unimodal.input.json`.

- **The candidate schedule:** 07:00–23:00 every day, SAP's unimodal day (SAP 10.2 Table N7 note b), which SAP's Appendix N gives heat pumps on their days of longer heating. Heating is off from 23:00 to 07:00.
- **Everything else as the decision run above:** the same house, quantity, 19 °C operative in HEM and 19.8 °C air in the engine, heat capacity, uncapped heating on both sides, weather, step, pre-roll and GMT hours.
- **What it decides:**
  - the gap is engine ÷ HEM − 1 on annual space heat, with the same bands: within 15%, the engine may use this schedule for the heat pump; 15–30%, it may not until the two-node fallback is built; above 30%, stop and review with Magnus;
  - the **bias** is this gap minus the decision run's +4.3%. It is how far the engine moves the heat pump's space heat against the boiler's when the two run on these different schedules. A negative bias favours the heat pump. It is reported, and stated with the schedule wherever the schedule is used. It does not adjust anything.
- **Not decided by this run:** whether the heat pump schedule is this one. That is Magnus's call, on the evidence in the schedules ADR.

## Scheduled results (20 October 2026)

HEM was rebuilt at the pinned commit and run on the committed input files with the same weather file (SHA-256 checked). Rerunning `main.input.json` reproduced 15,455 kWh, so the build matches phase 1.

| Run | HEM space heat | HEM delivered | HEM air temperature when heating | The engine | Engine ÷ HEM − 1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `schedule-sap` (decision) | **13,580 kWh** | 13,580 kWh | 20.45 °C | **14,165 kWh** (19.8 °C air) | **+4.3%** |
| `schedule-unimodal` (heat pump schedule check) | 14,842 kWh | 14,842 kWh | 20.13 °C | 14,489 kWh (19.8 °C air) | −2.4% |
| `continuous-sap-mass` (diagnostic) | 17,311 kWh | 17,311 kWh | 19.81 °C | 15,851 kWh (19.8 °C air) | −8.4% |

- **The decision:** the gap is +4.3%, inside 15%, so the one-node engine proceeds, as the rule says. The engine test pins 14,165 kWh and guards it within 10% of HEM.
- **The post-run check:** HEM delivered exactly its demand in every run, so its heater never ran out of capacity.
- **The heat pump schedule check** (run after its rules were committed): −2.4%, inside 15%, so the engine may use 07:00–23:00 for the heat pump. The bias is −2.4% − 4.3% = **−6.7 points**: on these two schedules, the engine understates the heat pump's space heat against the boiler's by about 6.7 points, which favours the heat pump.
- **The diagnostic** puts the one node 8.4% below HEM under continuous heating with the same mass. At 19.8 °C with no mass, the engine gives 16,997 kWh, 1.8% below. So the one node's error depends on the heating pattern: it stores daytime surplus heat more readily than HEM's elements, which lowers continuous heating, and it charges its mass at the air temperature, which raises heating after a cold spell. Under SAP's periods the two partly cancel. A heat pump schedule that heats for longer moves the engine towards the continuous error, and so would understate its heat; see the [schedules ADR](../../../REFERENCE/decisions/2026-10-20-heating-schedules-one-thermal-mass-node.md).
- **A sensitivity, run after the result:** HEM heated the air to 20.45 °C on average when heating, not the 19.8 °C fixed beforehand, because under intermittent heating the walls are colder and the air must run warmer for the same operative temperature. At 20.45 °C the engine gives 15,445 kWh, +13.7%, still inside 15%. The decision does not depend on the 19.8 °C choice.

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
   For the scheduled runs, record HEM's figures in `SCHEDULED_HEM_RESULTS` in `comparison.ts`, the engine's pinned figures in the HEM checks in `src/engine/simulate.test.ts`, and both in the table above, then run `npm run report` and commit the report. The hourly `__core__results.csv` gives the air temperature (`house: internal air temp`), the demand (`house: space heat demand`) and the heater's output (`main: energy output`).

## Results (17 October 2026)

The results table is in the [benchmark README](../README.md#step-2-hem-run), generated from `HEM_RESULTS` in `comparison.ts`. The pre-registered answer is 15,455 kWh, with the rough calculation 15.7% below it.

HEM's own heat transfer coefficient for the main case is 303 W/K, against the rough calculation's 302 W/K, so the two describe the same house. Over the year, HEM's ventilation heat loss works out at about 0.89 air changes an hour, against the draft 1.0.

### Why HEM comes out higher

**HEM's thermostat controls operative temperature, not air temperature.** Operative temperature is roughly the average of the air and the room surfaces. In a poorly insulated house the walls and windows are cold, so HEM heats the air to about 18.8 °C, on average over heating hours, to make the room feel like 18 °C. The rough calculation and the phase 1 engine treat 18 °C as the air temperature.

At a 17 °C thermostat, HEM's air averages 17.8 °C over heating hours, close to the rough calculation's 18 °C. HEM then gives 13,660 kWh, and the rough figure is 4.6% below it. Each 1 °C on the thermostat changes HEM's answer by about 1,700 kWh (11%).

So the gap is mostly about what "18 °C" means, not a flaw in the method. The 17 °C run closes about 70% of it. Some of the remaining 4.5% may be weather, because the rough calculation uses Heathrow's 1991–2020 monthly means and HEM uses the PVGIS typical year (annual mean 11.1 °C). The engine PR repeats this check with the same weather on both sides, which is the cleaner comparison. *(Result: 12,847 kWh, 6.0% below HEM. Phase 2 added SAP's 0.9 for non-normal incidence to solar gains, and the re-pinned check gives 12,999 kWh, 4.8% below. See [engine.md](../../../REFERENCE/engine.md#checks-against-outside-references).)* This sensitivity was run after the main result was known, so it explains the gap but does not replace the pre-registered answer.

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
