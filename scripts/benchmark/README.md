# Benchmark

The benchmark tests the project's riskiest assumption: that a simple engine gets a house's heat demand right. The plan is in [SPECIFICATIONS/01-engine-core.md](../../SPECIFICATIONS/01-engine-core.md), section "Benchmark".

This folder holds all four steps: a rough calculation (step 1), a run of the government's Home Energy Model in [hem/](./hem/README.md) (step 2), a comparison with measured gas use from NEED (step 3), and the decision (step 4).

**Summary (17 October 2026):**
- **The method holds up.** HEM, given the same house, needs 15,455 kWh of space heat a year, 19% more than the rough calculation (put the other way, the rough calculation is 15.7% below HEM). Most of the gap comes from HEM's thermostat controlling the felt (operative) temperature rather than the air temperature: at about 17.8 °C of air, HEM is within 5% of the rough figure.
- **The inputs probably don't.** Real homes like this one use less gas than either model predicts. NEED gives 10,980–15,433 kWh of gas a year, about 7,600–11,400 kWh of space heat, depending on how it is read, against the rough calculation's 13,000.
- **The decision:** proceed without thermal mass, and calibrate the mean internal temperature to NEED in the register (step 4).

## Step 1: rough heat-demand calculation

**Result: about 13,000 kWh a year of space heat for the main case, with 100 mm of loft insulation (H about 300 W/K).** The variant with no loft insulation gives about 18,000 kWh (H about 390 W/K).

These numbers set an early expectation. Step 4 applies the 15%/30% decision rule to them against HEM, and the engine PR repeats that check with the engine itself.

### What it computes

For the phase 1 archetype (a 1930–49 semi in London, about 90 m², two storeys, unfilled cavity walls, retrofitted double glazing):

1. **H**, the heat loss coefficient in W/K: the sum of U-value × area for walls, windows, door, roof and ground floor, plus 0.33 × air changes per hour × heated volume.
2. **The balance point**: the outdoor temperature at which internal and solar gains alone keep the house at its mean internal temperature. It equals the mean internal temperature minus gains ÷ H.
3. **Heating degree days** for London at that balance point, from monthly mean temperatures using Hitchin's formula (the CIBSE TM41 method). Unlike a fixed 15.5 °C table, this works at any base temperature.
4. **Annual space heat** = H × degree days × 24 ÷ 1000, in kWh.

This is a monthly degree-day method. It is not the hourly method the phase 1 engine will use. The two should agree roughly, and a large disagreement would be worth investigating.

### How to run it

```bash
npm run benchmark:rough
```

The command runs `scripts/benchmark-rough.ts`, which prints the results tables below. The calculation lives in `heatDemand.ts` and `roughEstimate.ts` in this folder, and both are tested. The draft inputs, each with its status and a source or rationale, are in `draftValues.ts`.

A test checks that this README contains the script's current output. If a draft value changes, the test fails until the tables below are replaced with a fresh run.

### Result (17 October 2026)

| Element | Area (m²) | U (W/m²K) | U × A (W/K), 100 mm loft insulation (main case) | U × A (W/K), no loft insulation (variant) |
| --- | ---: | ---: | ---: | ---: |
| External walls (unfilled cavity) | 80.3 | 1.50 | 120.4 | 120.4 |
| Windows (double glazed) | 17.9 | 2.80 | 50.0 | 50.0 |
| Door | 1.9 | 3.00 | 5.6 | 5.6 |
| Roof | 45.0 | 0.40 or 2.30 | 18.0 | 103.5 |
| Ground floor (suspended timber) | 45.0 | 0.75 | 33.8 | 33.8 |
| Ventilation (1.0 ach × 225 m³) | | | 74.3 | 74.3 |
| **H** | | | **302** | **387** |

| | 100 mm loft insulation (main case) | no loft insulation (variant) |
| --- | ---: | ---: |
| Gains (450 W internal + 250 W solar) | 700 W | 700 W |
| Mean internal temperature | 18 °C | 18 °C |
| Balance point | 15.7 °C | 16.2 °C |
| Degree days at that balance point | 1,798 K·day | 1,934 K·day |
| **Annual space heat** | **13,000 kWh** | **18,000 kWh** |

Walls and ventilation are the largest losses in both cases. The roof matters a great deal. RdSAP's default for this age band is no loft insulation, but most real 1930s semis have had some added. **Decision (Magnus, 17 October 2026): the archetype's main case has 100 mm of loft insulation, and "no loft insulation" is kept as a variant.**

### A first sanity check

Ofgem's typical domestic consumption value for a medium gas user is 9,500 kWh a year from 1 July 2026 (down from 11,500). That is all gas use, including hot water and boiler losses, across all house types. At 85% boiler efficiency it is about 8,000 kWh of heat, of which perhaps 2,000 kWh is hot water, leaving about 6,000 kWh of space heat. (This first guess at hot water, 2,000 kWh, is refined to 1,700 kWh with its working in step 3.) Sources: [Ofgem TDCV decision, May 2026](https://www.ofgem.gov.uk/sites/default/files/2026-05/Review%20of%20typical%20domestic%20consumption%20values%20decision.pdf) and [Energy UK's explainer](https://www.energy-uk.org.uk/publications/energy-uk-explains-typical-domestic-consumption-values-2/). The 9,500 kWh figure was checked against the Ofgem document on 17 October 2026 (its gas table: medium 11,500 kWh before, 9,500 kWh from 1 July 2026).

**Our estimate is roughly two to three times that national average.** Some of the gap is expected: an unfilled-cavity semi from the 1930s uses more than the average home. But the gap is large enough to take seriously. It matches a known pattern: models built on RdSAP's default U-values tend to overstate the heat demand of older homes (the "prebound effect"), and BRE found RdSAP's old solid-wall default was pessimistic by about a quarter. This is exactly the risk the benchmark exists to test. Step 3 below compares against NEED statistics for semi-detached houses of this period, not the national average.

### Draft values and their status

Each value is marked with the register's statuses. The register rows in [`data/register.json`](../../data/register.json) carry the same values (see [register.md](../../REFERENCE/register.md)).

- **sourced**: checked against the named source while writing this.
- **to-verify**: taken from the named source, not yet checked line by line. RdSAP values cite the [RdSAP 10 specification](https://bregroup.com/documents/d/bre-group/rdsap-10-specification-10-06-2025) (BRE, June 2025); the Hitchin constant cites [CIBSE TM41](https://www.cibse.org/knowledge-research/knowledge-portal/technical-memorandum-41-degree-days-theory-and-application-2006-pdf/).
- **approximate**: an estimate, with the reason given.

| Value | Draft | Status | Source or rationale |
| --- | --- | --- | --- |
| Floor area | 90 m² | approximate | The spec's archetype; two storeys of 45 m². |
| Storey height | 2.5 m | approximate | Typical for the period; RdSAP's upper-floor void is ignored. |
| Exposed perimeter | 20 m | approximate | A footprint of about 6.5 m × 7 m: front, back and one side. The party wall has no heat loss. |
| Heated volume | 225 m³ | approximate | Floor area × storey height. |
| Window area | 17.9 m² | to-verify | RdSAP formula for houses in age bands A–C: 0.122 × floor area + 6.875. |
| Door area | 1.85 m² | to-verify | RdSAP standard area for one door. |
| Wall U-value | 1.5 W/m²K | to-verify | RdSAP England default for an unfilled cavity wall, age bands A–E. |
| Window U-value | 2.8 W/m²K | approximate | Retrofitted PVC double glazing of unknown date. RdSAP gives about 3.1 before 2002 and about 2.0 after. |
| Door U-value | 3.0 W/m²K | to-verify | RdSAP default for an external door. |
| Floor U-value | 0.75 W/m²K | approximate | Uninsulated suspended timber floor, perimeter ÷ area about 0.44. The register row will store the BS EN ISO 13370 working. |
| Roof U-value, main case | 0.40 W/m²K | to-verify | RdSAP value for 100 mm of insulation at the joists. |
| Roof U-value, variant | 2.3 W/m²K | to-verify | RdSAP default for age bands A–D when loft insulation is unknown (treated as none). |
| Air change rate | 1.0 ach | approximate | Older house with a suspended floor, a chimney and some draughtproofing. |
| Mean internal temperature | 18 °C | approximate | Whole-house mean under continuous heating, between SAP's living-area and rest-of-house temperatures. |
| Internal gains | 450 W | approximate | SAP-style sum for about 2.5 occupants in 90 m². |
| Solar gains | 250 W | approximate | Heating-season mean: about 18 m² of glazing × g 0.63 × frame 0.7 × shading 0.77 × about 40 W/m² vertical irradiance. |
| Hitchin constant k | 0.71 | to-verify | The UK value used in CIBSE TM41. |
| London monthly mean temperatures | Jan 5.55 °C … Dec 5.95 °C | sourced | Heathrow, 1991–2020: the mean of (tmax + tmin) ÷ 2 for each month, from [Met Office historic station data](https://www.metoffice.gov.uk/pub/data/weather/uk/climate/stationdata/heathrowdata.txt), downloaded 17 October 2026. All 30 years are present for every month. |

### Limitations

- Monthly degree days with constant gains. Solar gains are really much lower in midwinter, which this method smooths over.
- Continuous heating to one mean internal temperature, with no thermal mass, as in the phase 1 engine.
- Heathrow's 1991–2020 average, not the PVGIS typical year the engine will use. Heathrow sits about 20 km west of the engine's central London point, so its temperatures may differ slightly.
- The geometry is a plausible box, not a measured house or an RdSAP dimension set.

## Step 2: HEM run

The full write-up, the agreed comparison rules, the input files and the steps to reproduce the run are in [hem/README.md](./hem/README.md). The comparison rules were committed before HEM was run.

| Run | What it is | HEM air temperature when heating | HEM space heat | Rough calculation (18 °C air) | Rough vs HEM |
| --- | --- | ---: | ---: | ---: | ---: |
| `main` | **Pre-registered main case: 100 mm loft insulation, 18 °C thermostat** | 18.80 °C | **15,455 kWh** | 13,032 kWh | **−15.7%** |
| `no-loft-insulation` | Variant: no loft insulation, 18 °C thermostat | 18.95 °C | 21,441 kWh | 17,987 kWh | −16.1% |
| `thermostat-17` | Sensitivity, run after the main result: 17 °C operative thermostat (about 17.8 °C air) | 17.79 °C | 13,660 kWh | 13,032 kWh | −4.6% |
| `thermostat-16` | Sensitivity, run after the main result: 16 °C operative thermostat | 16.78 °C | 11,971 kWh |  |  |

## Step 3: measured gas use (NEED)

NEED links metered gas use to property records for millions of homes. The figures are 2024 gas use, weather-corrected, from DESNZ's [NEED 2026 consumption tables](https://www.gov.uk/government/statistics/national-energy-efficiency-data-framework-need-consumption-data-tables-2026). The numbers and the arithmetic are in `needReference.ts`, with tests.

**NEED has no 1930–49 age band.** Its bands are 1919–1944 and 1945–1964, so 1919–1944 is used. Nor does it break gas use down by house type, age and floor area together, so there are three ways to read it:

| Reading | Gas a year | Space heat (85% boiler) | Space heat (89% boiler) | Rough calculation vs reference |
| --- | ---: | ---: | ---: | ---: |
| A: 1919–44 houses, England and Wales, per m² × floor area | 10,980 kWh | 7,600 kWh | 8,100 kWh | +71%, +61% |
| B: as A, adjusted for London and for semi-detached houses | 13,467 kWh | 9,700 kWh | 10,300 kWh | +34%, +27% |
| C: London 3-bed semis built 1919–44, median | 15,433 kWh | 11,400 kWh | 12,000 kWh | +14%, +8% |

Space heat = gas × boiler seasonal efficiency − 1,700 kWh of hot water heat. Both conversion values are approximate draft values, with their rationale in `needReference.ts`. Reading A is 122.0 kWh/m² × 90 m²; reading C is the median of 173,006 homes. Run `npm run benchmark:tables` to regenerate both tables; a test checks the README matches.

**Caveats:**
- **A** corrects for floor area but mixes all house types and regions.
- **B** multiplies one-way ratios. London has more older homes, so part of the age effect is counted twice.
- **C** is the closest match by type, age and region, but isn't corrected for size. At A's per-m² rate it implies a house of about 127 m², larger than the 90 m² archetype. It is also the reading that flatters the model most.
- Cooking on gas, where homes have it, is included in NEED's gas figure and not taken off, so the space heat references are slightly high.
- The middle half of London 3-bed semis use 11,400–20,000 kWh of gas a year. A single archetype can only be compared with a typical home, not a particular one.
- None of the three readings was chosen before the data was seen.

**What it means:** HEM and the rough calculation agree with each other, but both are above what comparable homes actually use. That points at the inputs, not the method. The likely causes:
- real households heat less than the whole house to 18 °C all day;
- the RdSAP default U-values may be pessimistic for older homes (the "prebound effect" above).

## Step 4: the decision

**Decision (Magnus, 17 October 2026): proceed without thermal mass, define the engine's temperature as air temperature, and calibrate the mean internal temperature to NEED.**

1. **The HEM rule is amended, and the amendment is recorded here as made after seeing the result.**
   - **As written:** the rule gives a gap of 15.7%, which falls in the 15–30% band ("add a thermal-mass node").
   - **Why amend:** the gap comes from HEM controlling operative temperature, not from anything thermal mass would fix. Under continuous heating, thermal mass barely changes annual demand.
   - **The amended rule:** the engine's mean internal temperature means air temperature. The engine is checked against HEM at matching air temperature, which is the `thermostat-17` run (13,660 kWh at 17.79 °C mean air over heating hours, not exactly 18 °C), using the same 15% and 30% thresholds.
   - **The result:** the rough calculation (at 18 °C air) is 4.6% below that run, so phase 1 proceeds with no thermal mass. The engine PR repeats this check with the engine run at 17.8 °C air, and with a tighter 10% tolerance as a regression guard. *(Engine PR, 18 October 2026: the engine gives 12,847 kWh on the same PVGIS weather, 6.0% below HEM's 13,660 kWh. See [engine.md](../../REFERENCE/engine.md#checks-against-outside-references).)*
2. **The register calibrates the mean internal temperature to measured data.**
   - **What:** the uncertain mean internal temperature row is set so that the archetype's central annual gas use (space heat and hot water, from the engine's own boiler and hot water rows) hits a target fixed now, before the engine exists.
   - **The target:** 13,200 kWh of gas a year, the midpoint of readings A and C (10,980–15,433 kWh). The full A–C range is the tolerance the result must stay within. The row cites NEED as its source. *(Engine PR, 18 October 2026: the hourly engine solves 15.7 °C, which gives 13,124 kWh. See [register.md](../../REFERENCE/register.md#the-mean-internal-temperature-calibration).)*
   - **The fabric question:** the gap may partly come from pessimistic RdSAP U-values rather than behaviour. Calibrating the temperature absorbs both, so the row's rationale says so, and the phase 1 spec records it as technical debt. Splitting the correction between temperature and the fabric factor needs evidence this benchmark doesn't have (for example volunteer homes with known fabric), and matters most for phase 2's insulation options.
   - **An assumption to record in the register PR:** the calibrated temperature comes from gas-heated homes and applies to both setups ("the same household, different kit"). Heat pump households often heat for longer hours, so the row says so, and the phase 1 report lists it as a limitation.
   - **Why:** it corrects for real households heating less than the whole house all day, without new physics in phase 1. Intermittent heating schedules and thermal mass stay in phase 2.
3. **The NEED reference is the A–C range, not a single reading,** because none of the readings was chosen in advance.

