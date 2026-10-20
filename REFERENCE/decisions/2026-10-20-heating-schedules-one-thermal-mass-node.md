# ADR: Heating schedules on one thermal-mass node, calibrated by the setpoint

**Date:** 2026-10-20
**Status:** Accepted (confirmed by Magnus on 20 October 2026)
**Supersedes:** in part, the [calibration ADR](./2026-10-17-air-temperature-calibrated-to-need.md): its continuous mean internal temperature and "no thermal mass". Its target, its air-temperature meaning and its "same household, different kit" stay.

---

## Decision

The engine heats the house in **heating periods**, to a **setpoint**, up to each system's **output cap**. Between periods the heating is off and the house cools against its **thermal mass**.

- **One thermal-mass node** holds the air and the fabric at one temperature: C dT/dt = Q + G − H (T − T_out), stepped hour by hour with backward Euler, which is stable at every C.
  - C is SAP's thermal mass parameter × floor area. The parameter is a `table` row by wall construction: 250 kJ/m²K for masonry without internal insulation (RdSAP 10 Table 22), which covers every archetype.
  - Each year starts from the temperature the node reaches over the year's last week.
- **Schedules** are `hour-of-week` profile rows (1 heating, 0 off) in UK local time, converted by the calendar module.
  - The gas setups use SAP's pattern: weekdays 07:00–09:00 and 16:00–23:00 (SAP 10.2 Table 9), weekends 07:00–23:00 (SAP's unimodal day).
  - The heat pump setups heat 07:00–23:00 every day: SAP's longer heat pump day (Magnus, 20 October 2026; see "The heat pump schedule" below).
- **Output caps:**
  - the heat pump's is its design heat loss × a margin: H × 24.2 K (SAP 10.2 Appendix N, section N2) × 1.15 (the median ratio of rated output to design heat loss on HeatpumpMonitor.org);
  - the gas boiler's is a rated output row, 24 kW.
- **The calibrated behaviour row is the setpoint**, `heating.setpoint`, an air temperature. It replaces `heating.meanInternalTemperature`, which is removed.
  - The target is unchanged: the 1930s semi's central gas use is 13,200 kWh.
  - The solved setpoint is 17.6 °C (17.56). Low and high, from NEED readings A and C, are 16.2 and 18.8 °C. All three are inside the spec's plausible 16–21 °C.
  - The schedule is not fitted.
- **The heat pump's COP scale k** is solved on the reference run: the heat pump, with its own cap, on the gas setups' schedule, on the price cap with no control. Its real runs use the heat pump schedule with that k.

## Context

Time-of-use tariffs need to know *when* the house is heated, so phase 2 replaces continuous heating with schedules and thermal mass. The spec agreed the method, a check against HEM under the same schedule with rules committed before the run, and a decision rule: within 15% proceed; 15–30% build a two-node (5R1C) model; above 30% stop.

**The HEM check** (rules committed in `scripts/benchmark/hem/README.md` before HEM ran; the phase 1 benchmark house; 19 °C operative in HEM, 19.8 °C air in the engine; the same 22,500 kJ/K of heat capacity; uncapped on both sides):

| Run | HEM | The engine | Gap |
| --- | ---: | ---: | ---: |
| SAP's schedule (the decision run) | 13,580 kWh | 14,165 kWh | **+4.3%** |
| 07:00–23:00 every day (pre-registered separately) | 14,842 kWh | 14,489 kWh | −2.4% |
| Continuous, the same mass (diagnostic) | 17,311 kWh | 15,851 kWh | −8.4% |

The decision run is inside 15%, so the one-node engine proceeds. A sensitivity run after the result, at the 20.45 °C air temperature HEM actually reached, gives +13.7%, also inside 15%.

**The one node's error depends on the heating pattern.** With all its mass at the air temperature, the node stores daytime surplus more readily than HEM's elements (lowering continuous heating), and it charges that mass at the air temperature after each off period (raising intermittent heating). Under SAP's periods the two partly cancel.

**The spec expected continuous heating with full C to stay within 5% of phase 1.** It doesn't: on the 1930s semi the mass lowers continuous heating by 11.4%, 8.0% and 5.5% at 16, 19 and 21 °C, and by 7–22% across the archetypes at 16.3 °C. Magnus agreed on 20 October 2026 that the tests pin these figures in place of the 5% bound (see "Implications").

## The heat pump schedule

The spec asks for a sourced heat pump schedule ("longer, lower heating"), never tuned to favour either setup, or else the gas schedule with the issue 15 bias stated.

**The evidence:**
- **No source gives heat pump heating hours by hour of the week.** The Electrification of Heat daily data has daily mean indoor temperatures, not hours. HeatpumpMonitor.org records control types, not schedules.
- **SAP 10.2 Appendix N** gives heat pumps longer heating than SAP's standard pattern: 16 hours (07:00–23:00) or 24 hours on their coldest days, more of them the smaller the heat pump. At a plant size ratio of 1.15, Table N5 gives about 4 days at 24 hours and about 47 at 16 hours. That is a sizing rule, and it does not fit an hour-of-week row.
- **HeatpumpMonitor.org** (831 systems, 20 October 2026): 255 use pure weather compensation with no room influence and 118 weather compensation with a little room influence, against 52 with simple setpoint control. Pure weather compensation normally runs without a time schedule.
- **The Electrification of Heat daily data** (about 545 air source heat pumps; hybrids and ground source excluded): the median home's daily mean indoor air temperature falls only from 19.06 °C on days of 8–10 °C outdoors to 18.37 °C on days of −2 to 0 °C. A home heated in short periods cools more on cold days.
- **The engine on the 1930s semi** (central, the same fall in daily mean temperature between those days):

  | Heat pump schedule | Space heat | Running cost | Hours at the cap | Daily mean, 8–10 °C to 0–2 °C days | HEM bias against the boiler |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | The gas schedule | 8,770 kWh | £1,911 | 709 | −2.0 K | none |
  | 07:00–23:00 every day | 9,350 kWh | £1,967 | 597 | −0.9 K | −6.7 points |
  | Every hour | 10,410 kWh | £2,079 | 0 | 0 K | about −12.7 points |
  | *(The boiler, on the gas schedule)* | *9,390 kWh* | *£2,046* | *70* | *−0.75 K* | |

**Reading:** on the gas schedule the capped heat pump can't recover after each off period, so the house runs 2 K colder on cold days and uses 6.7% less heat than the boiler house. That flatters the heat pump on comfort the household doesn't get, which the measured heat pump homes don't show. Heating 07:00–23:00 every day matches SAP's own longer heat pump day, recovers most of the cold-day shortfall, and passed its pre-registered HEM check. Its bias of −6.7 points still favours the heat pump, and is stated. Heating in every hour is closest to the measured shape, but the engine understates it by about 12.7 points against the boiler, which it can't correct without the two-node model.

**Magnus's choice (20 October 2026): 07:00–23:00 every day,** with its bias of about 6.7 points stated in the report, the register row and the limitations. Issue 15 stays open: the hours are SAP's, not measured heat pump households'.

## Alternatives considered

- **Keep continuous heating with no mass:**
  - Why not: time-of-use tariffs and control need to know when heat is used.
- **Two nodes (air and mass, ISO 13790's 5R1C) now:**
  - Why not now: the pre-registered rule did not call for it (+4.3%). It is the agreed fallback, and the evidence for #13 and a longer heat pump schedule would favour it later.
- **C as an effective capacity smaller than SAP's parameter:**
  - Why not: the spec fixes C to SAP's parameter so it can't be tuned to the result.
- **A heat pump schedule from SAP's Appendix N, by day and month:**
  - Why not: the schedule row is an hour-of-week profile, and the rule depends on sizing.

## Trade-offs accepted

**The one node's pattern-dependent error:** about +4% on SAP's periods and −2% on 07:00–23:00 against HEM, so a gap of about 6.7 points between setups on different schedules. Stated with the heat pump schedule and in the report.

**The output caps are simple limits**, not a sizing method, and there is no backup heater. With the heat pump capped at 1.15 × its design heat loss, a house heated in short periods recovers slowly on cold mornings.

**One setpoint for both setups**, from gas-heated homes, as before ("the same household, different kit").

**The setpoint may absorb fabric error** as the mean temperature did (#14).

## Implications

**Tests:**
- C → 0 reproduces phase 1's continuous method exactly.
- At full C, continuous heating is pinned for the semi (11.4%, 8.0% and 5.5% below phase 1 at 16, 19 and 21 °C), in place of the spec's 5% bound.
- The decay test is within 2% of the exact exponential, as a share of the initial difference, at time constants of 10 hours or more. Every archetype's C ÷ H is at least 10 hours (the shortest is 17.7).
- The energy balance closes every hour and over the year; the cap is never exceeded.
- The continuous HEM check runs without mass (12,999 kWh against 13,660) as the steady-state guard; the scheduled checks pin 14,165 and 14,489 kWh, within 10% of HEM.
- The setpoint drift test replaces the mean internal temperature drift test.

**Enables:** time-of-use tariffs and control in PR 6; evidence on #13 (closed) and #15.

**Prevents or complicates:** comparing the two setups on different schedules carries the stated bias until a two-node model exists.

---

## References

- [Phase 2 spec](../../SPECIFICATIONS/02-complete-v1-model.md), "Heating over time"
- [The HEM runs and their pre-registered rules](../../scripts/benchmark/hem/README.md)
- [SAP 10.2 specification (BRE, 14 March 2025)](https://bregroup.com/documents/d/bre-group/sap-10-2-14-03-2025): Table 9, Table 9a–c, Appendix N
- [RdSAP 10 specification (BRE, 9 June 2025)](https://bregroup.com/documents/d/bre-group/rdsap-10-specification-10-06-2025): Table 22
- [Electrification of Heat daily dataset (UK Data Service SN 9210)](https://datacatalogue.ukdataservice.ac.uk/studies/study/9210)
- [HeatpumpMonitor.org](https://heatpumpmonitor.org/)
- [Calibration ADR](./2026-10-17-air-temperature-calibrated-to-need.md), partly superseded
