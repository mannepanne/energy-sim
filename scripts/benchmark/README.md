# Benchmark

The benchmark tests the project's riskiest assumption: that a simple engine gets a house's heat demand right. The plan is in [SPECIFICATIONS/01-engine-core.md](../../SPECIFICATIONS/01-engine-core.md), section "Benchmark".

This folder holds step 1, a rough calculation. Steps 2–4 (a HEM run or measured data, and the decision) come in the `feature/phase-1-benchmark` PR.

## Step 1: rough heat-demand calculation

**Result: about 13,000 kWh a year of space heat for the main case, with 100 mm of loft insulation (H about 300 W/K).** The variant with no loft insulation gives about 18,000 kWh (H about 390 W/K).

These numbers set an early expectation. They do not trigger the 15%/30% decision rule, which compares the real engine with an independent reference in step 4.

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

Ofgem's typical domestic consumption value for a medium gas user is 9,500 kWh a year from 1 July 2026 (down from 11,500). That is all gas use, including hot water and boiler losses, across all house types. At 85% boiler efficiency it is about 8,000 kWh of heat, of which perhaps 2,000 kWh is hot water, leaving about 6,000 kWh of space heat. Sources: [Ofgem TDCV decision, May 2026](https://www.ofgem.gov.uk/sites/default/files/2026-05/Review%20of%20typical%20domestic%20consumption%20values%20decision.pdf) and [Energy UK's explainer](https://www.energy-uk.org.uk/publications/energy-uk-explains-typical-domestic-consumption-values-2/). The 9,500 kWh figure comes from secondary reporting and still needs checking against the Ofgem document.

**Our estimate is roughly two to three times that national average.** Some of the gap is expected: an unfilled-cavity semi from the 1930s uses more than the average home. But the gap is large enough to take seriously. It matches a known pattern: models built on RdSAP's default U-values tend to overstate the heat demand of older homes (the "prebound effect"), and BRE found RdSAP's old solid-wall default was pessimistic by about a quarter. This is exactly the risk the benchmark exists to test. Step 4 should compare against NEED statistics for 1930–49 semi-detached houses, not the national average.

### Draft values and their status

Each value is marked with the register's statuses. None of these is a register row yet; the real rows come in the `feature/phase-1-register` PR.

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
