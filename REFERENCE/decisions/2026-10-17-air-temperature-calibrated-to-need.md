# ADR: Air-temperature heating with no thermal mass in phase 1, calibrated to NEED

**Date:** 2026-10-17
**Status:** Active
**Supersedes:** N/A

---

## Decision

The phase 1 engine heats continuously to one mean internal temperature, has no thermal mass, and treats that temperature as an **air** temperature, not an operative one. The register's mean internal temperature row is **calibrated to measured gas use**: its central value is set so the archetype's central annual gas use is 13,200 kWh. That is the midpoint of the DESNZ NEED readings for comparable homes, and the result must stay within their range of 10,980–15,433 kWh. The same calibrated row applies to the gas and the heat pump setups.

## Context

The phase 1 benchmark (see [scripts/benchmark/README.md](../../scripts/benchmark/README.md)) tested the engine's riskiest assumption before the engine was built.

- **HEM, the government's model:** given the same house, it needs 15,455 kWh of space heat a year at an 18 °C thermostat. The rough calculation is 15.7% below that. The pre-agreed rule said a gap of 15–30% means "add a thermal-mass node".
- **The gap comes from the thermostat definition.** HEM's thermostat controls operative temperature, so in this poorly insulated house it heats the air to about 18.8 °C. At about 17.8 °C of air, HEM is within 5% of the rough calculation. Under continuous heating, thermal mass barely changes annual demand, so it would not close this gap.
- **NEED, measured gas use for comparable homes:** both models predict more than real homes use. Gas use of 10,980–15,433 kWh a year is about 7,600–11,400 kWh of space heat, against the rough calculation's 13,000. The likely causes are households heating less than the whole house all day, and RdSAP default U-values that are pessimistic for older homes.

## Alternatives considered

- **Apply the rule as written and add a thermal-mass node:**
  - Why not: the extra work does not address the cause found.
- **Keep the textbook inputs and only flag the gap:**
  - Why not: every result would overstate running costs for real homes, and therefore the savings too.
- **Model intermittent heating schedules and thermal mass in phase 1:**
  - Why not now: it is the most realistic option, but it is a phase 1 scope change. It is planned for phase 2.
- **Calibrate the fabric factor (`f_fabric`) instead, or split the correction:**
  - Why not now: the benchmark cannot tell behaviour error from fabric error. Splitting the correction needs homes with known fabric, such as the volunteer homes.
- **Air temperature, calibrated mean internal temperature, target fixed in advance:**
  - **Chosen:** simplest, honest about its source, and keeps phase 1 small.

## Reasoning

**The method is sound; the inputs need correcting:**
- HEM and the rough calculation agree once the temperature means the same thing.
- Measured data is the best evidence for what "typical" behaviour is.

**The target is fixed before the engine exists:**
- A range 40% wide would let the value be chosen after seeing results. Fixing the midpoint now prevents that, and the range becomes the tolerance.

**The amendment is recorded as made after seeing the result:**
- The rules were committed before HEM ran. Labelling the change keeps the pre-registration meaningful.

## Trade-offs accepted

**The temperature row may absorb fabric error:**
- If default U-values are the real cause, phase 2 insulation options will misjudge savings.
- Accepted for phase 1: the row's rationale says so, and the spec tracks it as technical debt.

**One calibrated temperature for both setups:**
- It comes from gas-heated homes. Heat pump households often heat for longer hours, which biases the heat pump running cost low.
- Accepted as "the same household, different kit". The register row and the phase 1 report state it.

**No thermal mass:**
- This is safe for annual totals under continuous heating, but it gives no hourly realism for time-of-use tariffs.
- Accepted: time-of-use tariffs and intermittent heating are phase 2.

## Implications

**Enables:**
- An engine whose central result matches comparable real homes.
- An engine check against HEM at matching air temperature (13,660 kWh, within 10%) as a regression guard.

**Prevents or complicates:**
- Insulation upgrade comparisons in phase 2 need this calibration revisited first.
- Changing the meaning of the temperature (to operative) later means re-running the benchmark.

---

## References

- [Benchmark write-up](../../scripts/benchmark/README.md) and [HEM run](../../scripts/benchmark/hem/README.md)
- [Phase 1 spec](../../SPECIFICATIONS/01-engine-core.md), "Benchmark" and "Technical debt introduced"
- [NEED 2026 consumption data tables (DESNZ)](https://www.gov.uk/government/statistics/national-energy-efficiency-data-framework-need-consumption-data-tables-2026)
- [Typed parameter register ADR](./2026-10-17-typed-parameter-register.md)
