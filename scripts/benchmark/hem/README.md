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
