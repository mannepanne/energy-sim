# ADR: A heat pump COP curve anchored on the field-measured SPF

**Date:** 2026-10-19
**Status:** Proposed (waiting for Magnus's confirmation before the phase 2 heat pump curve PR merges)
**Supersedes:** N/A (it replaces phase 1's single SPF applied to every hour)

---

## Decision

- **Each hour's COP is a curve scaled by one factor, k:**

  ```latex
  COP(t) = \min\Big(COP_{max},\; k \cdot \mathrm{clamp}\Big(\frac{T_{flow}(t) + 273.15}{T_{flow}(t) - T_{out}(t) + \Delta T_{lift}},\ s_{min},\ s_{max}\Big)\Big)
  ```

  - **The shape** is Carnot-like. Its lift allowance ΔT_lift and its clamp s_min to s_max are register rows. The clamp applies before scaling, and guards the hours when T_out nears T_flow.
  - **COP_max is a physical ceiling** on the scaled COP, also a row (7).
- **The shape sets *when* electricity is used. k sets *how much*.** k is solved once per sample on a **reference run**: the price cap, no control, and the gas setups' heating pattern (continuous heating until the schedules PR, then the gas schedule). On that run, total heat (space heat plus cylinder reheats) ÷ total electricity equals the sampled SPF.
  - **Without the ceiling,** the solve is closed-form: k = SPF × Σ(heat ÷ shape) ÷ Σheat.
  - **If k would put any hour above the ceiling,** those hours run at the ceiling and k is re-solved on the rest. This repeats until no further hour is capped, which gives the exact solution in a few steps. The run reports whether the ceiling bound, and the phase 2 report counts the samples in which it did.
- **The same k is reused on every tariff and under control.** `simulate` takes k as an option, so a controlled run uses the reference run's k and never re-solves it. Running the heat pump in colder hours, or at a higher flow temperature, then costs efficiency through the curve.
- **Flow temperatures:**
  - **Space heating** follows a weather-compensation line, from the design flow at the design outdoor temperature (−2 °C) to the mild flow at the mild outdoor temperature (15 °C), and flat beyond both ends. The two flow temperatures are uncertain rows.
  - **Hot water** uses one fixed, higher flow temperature, which stays above the high of the design flow's range, so hot water is always the dearer duty.
- **The well-installed scenario** swaps the SPF distribution for one anchored on HeatpumpMonitor.org. It is a labelled scenario, not a fifth setup, and the report says that sample is self-selected. Every other draw is shared, so the two scenarios pair sample by sample.

## Context

Phase 1 divided each hour's heat by one seasonal SPF. That gives the right annual electricity, but spreads it evenly over the heat. Phase 2 adds time-of-use tariffs and control rules that move heat pump running between hours. With one flat SPF, moving running into the coldest hours would cost nothing, so control would look free and the heat pump on Cosy or Agile would look better than it is.

A curve from a datasheet or a physics model gives the right shape but the wrong level: field trials measure far lower seasonal performance than datasheets suggest. The Electrification of Heat trial's median air source SPF is about 2.8. The project's trust rule is that no brochure figure may make the model optimistic.

## Alternatives considered

- **Keep one SPF for every hour:**
  - Why not: control and tariffs would change cost but never efficiency, which flatters any rule that shifts running into cold hours.
- **A manufacturer's COP map (by outdoor and flow temperature), used as is:**
  - Why not: its level is a laboratory figure, well above field performance, so the heat pump would look cheaper than measured homes show. Which manufacturer to pick is also a neutrality problem.
- **Fit the curve's level to the Electrification of Heat data by outdoor temperature:**
  - Why not: it fits one trial's installations, and the fit would need the trial's daily dataset, which may not be openly available. The trial's figures are used as a cross-check of the shape instead.
- **Re-solve k on every run (each tariff, with and without control):**
  - Why not: every run would land on the sampled SPF again, which erases the very effect the curve is for.
- **A Carnot-like shape scaled by k, solved once on a reference run:**
  - **Chosen:** the year matches the field SPF exactly on the reference run, the shape is physically motivated and has few parameters, and control changes efficiency in the direction physics says.

## Reasoning

- **Anchored on the field.** On the reference run the result is the sampled SPF to within floating-point error. A test checks this to within 0.1% in every one of 200 samples, in both SPF scenarios, on the real register.
- **Explainable.** The curve has five numbers, each a register row with a reason. The flow temperatures are the only uncertain ones, and on the price cap they move only *when* electricity is used.
- **Clamp before scaling** keeps k a closed-form solve in the usual case. The ceiling after scaling stops k from implying an impossible COP in mild hours, and the iterative solve keeps the SPF exact when it binds.
- **Tests guard the direction:** COP falls as outdoor temperature falls and as flow rises; hot water's COP is below space heating's in every hour; the scaled COP never exceeds the ceiling and stays above 1 at the lowest SPF; at a fixed k, moving the same heat into colder hours lowers the year's efficiency.

## Trade-offs accepted

- **The shape is an assumption, not a measurement.** The lift allowance, the clamp and the compensation line are approximate rows. They are cross-checked against the Electrification of Heat trial's published performance by outdoor temperature (see `REFERENCE/engine.md`), but not fitted to it.
- **Part-load and defrost are not modelled separately.** The shape's ceiling stands in for cycling losses in mild weather, and k absorbs average defrost and part-load losses over the year.
- **No capacity limit or backup heater** until the output cap lands with the schedules PR.
- **The reference run is the gas pattern.** If heat pump households heat differently (issue 15), the SPF is still matched on the gas pattern's hours, and the heat pump schedule then changes efficiency through the curve.

## Implications

**Enables:**
- Time-of-use tariffs and control rules whose cost and efficiency move together.
- A well-installed scenario that changes the level and keeps the shape.

**Prevents or complicates:**
- Every caller that runs the heat pump under control must pass the reference run's k. A controlled run without it would silently re-solve k on itself. The tariffs PR adds a test that pins this.
- Changing a curve row moves when electricity is used, so time-of-use results shift, even though price cap results do not.

## References

- [Phase 2 spec: "The heat pump over the year"](../../SPECIFICATIONS/02-complete-v1-model.md#the-heat-pump-over-the-year)
- [Typed parameter register ADR](./2026-10-17-typed-parameter-register.md)
- `src/engine/heatPump.ts` and `src/engine/heatPump.test.ts`
