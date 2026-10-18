# ADR: UTC engine hours, with schedules and tariffs in UK local time

**Date:** 2026-10-18
**Status:** Proposed in the phase 2 archetypes PR; awaiting Magnus's confirmation before merge
**Supersedes:** N/A

---

## Decision

- **Engine hours are UTC hours 0–8,759 of the PVGIS typical year.** This is unchanged from phase 1.
- **Schedules, tariff periods and hourly profiles are defined in UK local time.** A calendar module (`src/engine/calendar.ts`) converts them to engine hours.
- **Clock changes:** the module applies the UK rule (the last Sunday in March and the last Sunday in October, at 01:00 UTC) to a reference year, 2026. That puts the changes on 29 March and 25 October.
  - On the day the clocks go forward, local 01:00 has no engine hour.
  - On the day they go back, local 01:00 has two, and a profile applies its 01:00 value to both.
  - Cosy's periods stay fixed in local time across the change.
- **Weekdays follow a fixed rule:** 1 January is a Monday, and the days follow on from there. A local day's weekday comes from its local date, so 23:00 UTC in summer already belongs to the next day.
- **Agile half-hours** are matched to the typical year by UTC calendar date and time (month, day, hour, minute). 29 February is dropped. Each engine hour's rate is the mean of its two half-hours.
- **The reference year (2026) and the Monday rule are method settings in code**, as the register ADR's amendment allows.

## Context

The PVGIS typical year stitches each month from a different source year, and its timestamps are UTC. It has no real weekdays and no clock changes of its own. Phase 2 needs both:
- heating schedules differ on weekdays and weekends;
- Cosy's cheap and peak periods are fixed in local time;
- Agile prices are half-hourly and published in UTC.

Mixing time bases between modules would shift every time-of-use cost by an hour for half the year.

## Alternatives considered

- **Run the engine in local time:**
  - Why not: the weather and the sun position are in UTC, and a local-time year has a 23-hour and a 25-hour day, which breaks the fixed 8,760-hour arrays.
- **Take weekdays from each month's source year:**
  - Why not: weekdays would jump at every month boundary, and a "week" could have two Mondays.
- **Apply no clock changes (treat local time as GMT all year):**
  - Why not: summer evening peaks and Cosy's periods would sit an hour off for seven months.
- **UTC engine, local-time profiles, a fixed reference year and a Monday rule:**
  - **Chosen:** one conversion point, deterministic, and testable.

## Reasoning

- **One module owns the conversion.** Every hourly profile goes through `expandWeekly` or `expandDaily`, so no module does its own time arithmetic.
- **The rule is deterministic.** The same inputs give the same calendar, which the byte-identical report needs.
- **Tests guard the edges:**
  - the clock changes move local-time periods by one UTC hour on 29 March and 25 October;
  - every local day covers 24 engine hours, except 23 and 25 on the two change days;
  - half-hours average correctly;
  - 29 February is dropped.

## Trade-offs accepted

- **The weekday rule and the clock-change dates disagree with each other.** In 2026, 29 March and 25 October are Sundays. Under the Monday rule they fall on a Thursday of the engine's week. The report states this.
- **Agile's past weekdays don't line up with the engine's weekdays.** Matching by date keeps the season and the clock changes, but a real Saturday price can land on an engine weekday. The spec accepts this and the report states it.
- **One reference year.** The clock-change dates move a few days between years. That is small next to the other approximations of a typical year.

## Implications

**Enables:**
- Heating schedules (`hour-of-week` profiles), Cosy and Agile, and hourly base electricity and hot water draw-off profiles, all in local time from the start.

**Prevents or complicates:**
- Real-calendar comparisons (for example, matching a household's own half-hourly meter data) need their own mapping onto the typical year. That is a later phase.

---

## References

- [Phase 2 spec](../../SPECIFICATIONS/02-complete-v1-model.md), "Time base"
- [The Summer Time Order 2002](https://www.legislation.gov.uk/uksi/2002/262/contents/made): the last-Sunday rule at 01:00 GMT
- [REFERENCE/register.md](../register.md), "The PVGIS snapshot": the typical year's UTC timestamps and source months
