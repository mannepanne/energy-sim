# ADR: Rule-based tariff control for the heat pump

**Date:** 2026-10-21
**Status:** Proposed (awaiting Magnus's confirmation)
**Supersedes:** N/A. It builds on the [schedules ADR](./2026-10-20-heating-schedules-one-thermal-mass-node.md), the [COP curve ADR](./2026-10-19-heat-pump-cop-curve-anchored-on-field-spf.md) and the [time-base ADR](./2026-10-18-time-base-utc-engine-local-schedules.md).

---

## Decision

On a time-of-use tariff, the heat pump follows a few fixed, published rules. There is no optimiser.

**Cheap and peak hours** (each engine hour is cheap, peak or neither):
- **Cosy:** the hours at the profile's lowest rate are cheap (04:00–07:00, 13:00–16:00 and 22:00–00:00); the hours at its highest are peak (16:00–19:00). These stay fixed in UK local time across the clock changes.
- **Agile:** in each UK local day, from midnight to midnight, the cheapest quarter of the hours is cheap and the dearest quarter is peak. The quarter is a register row (`tariffs.agileCheapPeakShare`).
  - The count is rounded to whole hours, so the 23- and 25-hour days of the clock changes also get 6.
  - Ties go to the earlier hour.
- **The price cap** has neither.

**The rules:**
- **Preheat:** in a cheap hour during a heating period, or up to 3 hours before one (`heating.preheatLeadTime`), the heat pump heats to setpoint + boost. The boost is an uncertain row (`heating.controlBoost`, 1–2 K, mode 1.5 K).
- **The comfort cap:** setpoint + boost is the most control ever heats to.
- **Coast:** in a peak hour during a heating period, the target falls to setpoint − boost, and never lower.
- **Cylinder:** the cylinder is filled to its setpoint in every cheap hour. Outside cheap hours, a reheat lifts it only back to its minimum. So as much of the reheat as the store can hold falls in cheap hours, and it never ends an hour below its minimum.
- **Everything else follows the schedule.**

**What control does not touch:**
- **The price cap:** it has no cheap or peak hours, so the rules change nothing. A test checks that control on and off give identical hourly results.
- **The gas setups:** they have no control, and the combi has no store. On Agile, a gas home's electricity is priced by the hour; gas is always on the price cap.
- **k:** the heat pump's COP scale is solved once per sample on the reference run (the price cap, no control, the gas schedule). Every tariff and control run reuses it, so moving running into warmer or colder hours changes efficiency only through the curve.
- **Solar:** control is blind to solar. Solar then meets what it can in each hour, as before.

**Agile's limitations** are stated wherever Agile results appear (`npm run tariffs` now, the phase 2 report in PR 7, the register row):
- which 12 months were used (October 2025 to September 2026);
- that a past year is not a forecast;
- that past prices on typical-year weather lose the link between price spikes and cold, still days, which likely flatters the heat pump;
- that control knows each day's prices in advance (realistic for a smart controller, since Octopus publishes them the day before, but it favours the heat pump over a household that doesn't respond);
- that weekdays don't match between the past year and the reference year.

**Agile's VAT, for Magnus to confirm:** the past 12 months carried 5% VAT on electricity, but there is no VAT on electricity from 1 October 2026 to 31 March 2027, and the price cap and Cosy rows carry none. The engine uses Agile's rates before VAT with today's VAT applied (`prices.electricityVatRate`, 0), so every tariff is on the same footing. Using the past year's inc-VAT rates instead would make Agile about 5% dearer than the cap for a reason that no longer applies. The snapshot keeps both, so either is a one-line change.

## Context

The spec (architecture decision 4) chose rule-based control so results are explainable and fast, and listed the rules. Writing them down exposed details the spec left open:
- how to count a "quarter" of a 23- or 25-hour day;
- how to break ties;
- what the cylinder rule means for a store that holds only about 1.2 kWh between its setpoint (50 °C) and its minimum (45 °C), a quarter of a day's draw-off.

**The central results** on the 1930s semi, heat pump without solar, at the default boost of 1.5 K:

| | Space heat | Mean indoor temperature | Heat pump electricity | Year's SPF | Share in cheap hours | Share in peak hours | Running cost | Carbon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Price cap | 9,348 kWh | 18.2 °C | 4,214 kWh | 2.80 | — | — | £1,943 | 967 kg |
| Cosy, control off | 9,348 kWh | 18.2 °C | 4,214 kWh | 2.80 | 18% | 8% | £1,983 | 967 kg |
| Cosy, control on | 11,409 kWh | 19.1 °C | 4,854 kWh | 2.85 | 73% | 1% | £1,712 | 1,059 kg |
| Agile, control off | 9,348 kWh | 18.2 °C | 4,214 kWh | 2.80 | 9% | 33% | £1,455 | 967 kg |
| Agile, control on | 10,246 kWh | 18.6 °C | 4,474 kWh | 2.83 | 39% | 11% | £1,387 | 1,004 kg |

For comparison, the gas boiler on the price cap costs £2,036 and emits 2,790 kg.

**Three things to note:**
- **Control saves money but uses more heat.** On Cosy it saves £271 a year against control off, with 22% more space heat and 15% more electricity, because preheating holds the house at setpoint + boost for 8 hours a day. On Agile it saves £68.
- **The house is warmer under control.** It averages 0.9 K warmer on Cosy and 0.4 K on Agile. This comfort is not valued anywhere, and it raises carbon by about 90 kg and 40 kg.
- **The year's SPF rises a little,** because Cosy's 13:00–16:00 and Agile's cheapest hours tend to be warmer. This follows from the COP curve, not from k.

## Alternatives considered

- **An optimiser** (for example, a linear programme over each day's prices, with comfort bounds):
  - It would find cheaper schedules, and could trade comfort for cost explicitly.
  - Why not: it is harder to explain, slower (10 combinations and 500 samples), and its result depends on the solver's settings. The spec chose rules.
- **Preheat only before heating periods,** with no boost inside them:
  - It would add less heat, but would miss Cosy's 13:00–16:00 window, the largest share of cheap hours inside the heat pump's day.
  - Not chosen; it is the spec's rule that preheat applies "during a heating period".
- **A cylinder that is topped up to its setpoint in cheap hours, with forced reheats also to the setpoint:**
  - The first version did this. A forced evening reheat then refilled the store just before the overnight cheap hours, leaving little for them to do.
  - Lifting the store only to its minimum outside cheap hours keeps as much reheat as the store can hold for the cheap hours.
- **A fixed Agile quarter of 6 hours** instead of a share:
  - It is the same on 24-hour days.
  - A share keeps the rule the spec wrote, and states the rounding on the clock-change days.

## Reasoning

- **Rules are explainable.** Each one can be shown on the site in a sentence, and each result can be traced to it.
- **Rules are fast.** One extra thermal pass per time-of-use tariff, shared by the solar and no-solar setups. One central run of all 10 combinations takes about 3 ms, and 500 samples of them about 1.2 seconds on Magnus's machine.
- **Neutral by construction.** Control acts only on cheap and peak hours, so the price cap, where the phase 1 comparison sits, is unchanged. k stays anchored on the field SPF, so control can't make the heat pump's efficiency optimistic.
- **The boost is in the sensitivity tables.** It is an uncertain row, listed only for the combinations whose cost it can move.

## Trade-offs accepted

- **Comfort is not valued.** Control on Cosy keeps the house about 0.9 K warmer. The engine counts the extra heat's cost, but not its comfort, so control's saving is a lower bound on its value to a household that wants the warmth, and an upper bound for one that would rather turn the setpoint down.
- **Perfect foresight on Agile.** Control knows each day's prices. This is stated as a limitation.
- **The cylinder is one temperature.** It can't stratify, so it stores only about 1.2 kWh between its setpoint and minimum, and control moves only part of the reheat.
- **No optimiser, so not the cheapest schedule.** The rules are simple, not optimal, and the report says so.

## Implications

- **The engine** (see [engine.md](../engine.md#tariffs-and-control)):
  - `src/engine/tariffs.ts` builds each tariff's hourly rates and bands;
  - `src/engine/control.ts` sets each hour's target temperature;
  - `src/engine/cylinder.ts` takes the bands;
  - `src/engine/combinations.ts` names the 10 combinations and runs them, sharing heat sides.
- **The comparison layer** compares combinations against the gas boiler on the price cap. It reports the share cheapest across all 10 and within each tariff.
- **The register** gains the Cosy and Agile rows, the Octopus snapshot, the boost, the preheat lead time, the Agile quarter and today's VAT rate (see [register.md](../register.md)).
- **The phase 2 report (PR 7)** must show Agile's limitations next to any Agile result. `scripts/tariffs/table.ts` exports the text.

## References

- [Phase 2 spec](../../SPECIFICATIONS/02-complete-v1-model.md): "Tariffs and control", "Time base" and architecture decision 4.
- [Octopus Energy public API](https://api.octopus.energy/v1/products/): Cosy (COSY-22-12-08) and Agile (AGILE-24-10-01) for region C, fetched on 21 October 2026.
- [Ofgem: energy price cap unit rates and standing charges](https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges): no VAT on electricity from 1 October 2026 to 31 March 2027.
