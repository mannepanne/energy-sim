# Archetype checks against NEED

This folder checks each house type (archetype) against measured gas use from NEED, the government's National Energy Efficiency Data-Framework. The plan is in [SPECIFICATIONS/02-complete-v1-model.md](../../SPECIFICATIONS/02-complete-v1-model.md), section "House types and geometry".

## Agreed before the run (18 October 2026)

This section, and the readings in [`needReadings.ts`](./needReadings.ts), were committed before any archetype was run through the engine. They fix what counts as the answer, so the answer can't be chosen afterwards.

- **The quantity compared** is each archetype's central annual gas use for the gas boiler setup: space heat plus hot water, divided by the boiler efficiency, with every uncertain row at its default and the archetype's default quick-facts answers.
- **Reading T (by type):** the 2024 London median gas use for the archetype's NEED property type, NEED age band and default bedroom count, for homes with gas and a standard electricity meter. Source: NEED 2026, `Consumption_multiple_attributes_EW_2024.xlsx`, sheet "Table". This is how phase 1's reading C was built.
- **Reading S (by size):** the 2024 England and Wales median gas use per m² for houses in the NEED age band, times the archetype's default floor area. Source: NEED 2026, `Consumption_gas_per_square_metre_EW_2024.xlsx`, Table 4.2c. This is how phase 1's reading A was built.
- **Fallbacks, decided from the NEED tables alone:**
  - Table 4.2c has no split after 2000, so the 2000–11 semi and the 2012-onwards mid-terrace both use its "2000 onwards" column for reading S.
  - NEED has no 1930–49 band; the 1930s semi uses 1919–44, as in phase 1. The 1950–66 archetypes use 1945–64, the 1967–75 and 1976–82 archetypes use 1965–82, the 1983–90 archetype uses 1983–92, and the 2007–11 archetype uses 2000–11.
  - Every reading T cell has more than 1,000 homes behind it (the smallest is 2,066), so no cell needed a fallback for a small sample.
- **Default bedrooms** are the bedroom count with the most homes in NEED's London rows for the archetype's type and age band. **Default floor areas** are the English Housing Survey 2012 mean usable floor area for the type and age band (*Floor Space in English Homes*, Figures 3.3–3.7). The 1930s semi keeps phase 1's 90 m² (the EHS mean for 1919–44 semis is 93.8 m²), so its readings stay those of phase 1.
- **The flag rule:** take the interval between readings T and S. If central gas use lies inside it, the gap is 0. Otherwise the gap is the distance to the nearer end, as a share of that end. **An archetype is flagged if its gap is above 25%.** A flagged archetype stays in the results with a visible warning; it is not dropped.
- **No archetype is tuned to its readings.** The behaviour rows are calibrated on the 1930s semi alone (target 13,200 kWh), and every other archetype uses the same behaviour rows. Their gaps are evidence on [issue 14](https://github.com/mannepanne/energy-sim/issues/14), not targets.

## Readings

| Archetype | NEED type and age band | Bedrooms | Homes | Reading T (kWh) | Reading S (kWh) |
| --- | --- | ---: | ---: | ---: | ---: |
| Mid-terrace, solid brick, before 1900 | Mid terrace, pre 1919 | 3 | 123,986 | 12,897 | 87 × 109.63 = 9,538 |
| End-terrace, solid brick, before 1900 | End terrace, pre 1919 | 3 | 25,559 | 14,748 | 104 × 109.63 = 11,402 |
| Semi-detached, cavity, 1930–49 | Semi detached, 1919–44 | 3 | 173,006 | 15,433 | 90 × 121.98 = 10,978 |
| Semi-detached, cavity, 1950–66 | Semi detached, 1945–64 | 3 | 45,115 | 12,873 | 88 × 112.23 = 9,876 |
| Bungalow, cavity, 1950–66 | Bungalow, 1945–64 | 2 | 5,078 | 12,561 | 73 × 112.23 = 8,193 |
| Mid-terrace, cavity, 1967–75 | Mid terrace, 1965–82 | 3 | 28,287 | 9,607 | 80 × 106.15 = 8,492 |
| Detached, cavity, 1976–82 | Detached, 1965–82 | 4 | 6,397 | 18,515 | 131 × 106.15 = 13,906 |
| Detached, cavity, 1983–90 | Detached, 1983–92 | 4 | 2,963 | 16,239 | 134 × 103.06 = 13,810 |
| Semi-detached, 2007–11 | Semi detached, 2000–11 | 3 | 2,066 | 10,741 | 85 × 74.37 = 6,321 |
| Mid-terrace, 2012–21 | Mid terrace, 2012 onwards | 3 | 3,553 | 8,734 | 86 × 74.37 = 6,396 |

Reading T is larger than reading S for every archetype: London homes use more gas than the national per-m² rate suggests, and NEED's medians are not corrected for size.
