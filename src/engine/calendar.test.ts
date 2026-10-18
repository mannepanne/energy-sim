// ABOUT: Tests for the time base: clock changes on the 2026 dates, weekdays from a Monday 1 January,
// ABOUT: local-time profiles expanded to UTC engine hours, and half-hourly rates averaged to hours

import { describe, expect, it } from 'vitest';
import {
  buildCalendar,
  expandDaily,
  expandWeekly,
  FIRST_DAY_WEEKDAY,
  hourlyFromHalfHourly,
  HOURS_PER_WEEK,
  REFERENCE_YEAR,
  summerTime,
  typicalYearHalfHour,
} from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';

const calendar = buildCalendar();
/** 29 March and 25 October 2026 are days 87 and 297 of the year, counting 1 January as day 0. */
const SPRING_DAY = 87;
const AUTUMN_DAY = 297;

const hoursOfDay = (day: number): number[] => Array.from(calendar.localHourOfDay.filter((_, hour) => calendar.localDayOfYear[hour] === day));
const onHoursUtc = (series: Float64Array, day: number): number[] =>
  Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => series[day * 24 + hour] === 1);

describe('summer time on the reference year', () => {
  it('runs from 01:00 UTC on 29 March to 01:00 UTC on 25 October 2026', () => {
    expect(REFERENCE_YEAR).toBe(2026);
    expect(summerTime()).toEqual({ startHour: SPRING_DAY * 24 + 1, endHour: AUTUMN_DAY * 24 + 1 });
  });

  it('follows the last-Sunday rule in other years', () => {
    // 2027: 28 March (day 86) and 31 October (day 303).
    expect(summerTime(2027)).toEqual({ startHour: 86 * 24 + 1, endHour: 303 * 24 + 1 });
  });

  it('rejects a leap year or a year that is not whole', () => {
    expect(() => summerTime(2024)).toThrow('non-leap year');
    expect(() => summerTime(2026.5)).toThrow('non-leap year');
  });
});

describe('the calendar', () => {
  it('starts on a Monday at local midnight, and gives every hour a weekday by the rule', () => {
    expect(FIRST_DAY_WEEKDAY).toBe(0);
    expect(calendar.hourOfWeek[0]).toBe(0);
    expect(calendar.weekday[24 * 6]).toBe(6);
    expect(calendar.weekday[24 * 7]).toBe(0);
    expect(calendar.localDayOfYear[HOURS_PER_YEAR - 1]).toBe(364);
  });

  it('puts both 2026 clock changes on a Thursday of the engine’s week, a stated mismatch', () => {
    expect(calendar.weekday[SPRING_DAY * 24]).toBe(3);
    expect(calendar.weekday[AUTUMN_DAY * 24]).toBe(3);
  });

  it('moves local time one hour ahead of UTC on the right dates', () => {
    const springChange = SPRING_DAY * 24 + 1;
    expect(calendar.utcOffsetHours[springChange - 1]).toBe(0);
    expect(calendar.utcOffsetHours[springChange]).toBe(1);
    const autumnChange = AUTUMN_DAY * 24 + 1;
    expect(calendar.utcOffsetHours[autumnChange - 1]).toBe(1);
    expect(calendar.utcOffsetHours[autumnChange]).toBe(0);
  });

  it('skips local 01:00 when the clocks go forward, and repeats it when they go back', () => {
    expect(hoursOfDay(SPRING_DAY)).toEqual([0, ...Array.from({ length: 22 }, (_, index) => index + 2)]);
    expect(hoursOfDay(AUTUMN_DAY)).toEqual([0, 1, 1, ...Array.from({ length: 22 }, (_, index) => index + 2)]);
  });

  it('puts a summer 23:00 UTC hour on the next local day', () => {
    const summerHour = 150 * 24 + 23;
    expect(calendar.localDayOfYear[summerHour]).toBe(151);
    expect(calendar.localHourOfDay[summerHour]).toBe(0);
    expect(calendar.hourOfWeek[summerHour]).toBe((151 % 7) * 24);
  });
});

describe('local-time profiles on engine hours', () => {
  /** On from 07:00 to 09:00 local time every day. */
  const morning = Array.from({ length: 24 }, (_, hour) => (hour >= 7 && hour < 9 ? 1 : 0));

  it('moves a local-time period one UTC hour earlier in summer', () => {
    const series = expandDaily(morning, calendar);
    expect(onHoursUtc(series, 10)).toEqual([7, 8]);
    expect(onHoursUtc(series, 200)).toEqual([6, 7]);
    expect(onHoursUtc(series, SPRING_DAY - 1)).toEqual([7, 8]);
    expect(onHoursUtc(series, SPRING_DAY)).toEqual([6, 7]);
    expect(onHoursUtc(series, AUTUMN_DAY)).toEqual([7, 8]);
  });

  it('covers 24 UTC hours for every local day, except 23 and 25 on the clock-change days', () => {
    const counts = new Map<number, number>();
    for (const day of calendar.localDayOfYear) counts.set(day, (counts.get(day) ?? 0) + 1);
    expect(counts.size).toBe(365);
    for (const [day, count] of counts) {
      expect(count, `local day ${day}`).toBe(day === SPRING_DAY ? 23 : day === AUTUMN_DAY ? 25 : 24);
    }
  });

  it('expands an hour-of-week profile, with weekday and weekend values', () => {
    const weekdayOnly = Array.from({ length: HOURS_PER_WEEK }, (_, hour) => (hour < 5 * 24 ? 1 : 0));
    const series = expandWeekly(weekdayOnly, calendar);
    expect(series).toHaveLength(HOURS_PER_YEAR);
    expect(series[12]).toBe(1);
    expect(series[5 * 24 + 12]).toBe(0);
    expect(series.reduce((total, value) => total + value, 0)).toBe(Array.from(calendar.weekday).filter((day) => day < 5).length);
  });

  it('rejects a profile of the wrong length', () => {
    expect(() => expandWeekly([1], calendar)).toThrow('needs 168 values, got 1');
    expect(() => expandDaily([1], calendar)).toThrow('needs 24 values, got 1');
  });
});

describe('half-hourly rates', () => {
  it('average each UTC hour’s two half-hours', () => {
    const halfHourly = Float64Array.from({ length: 2 * HOURS_PER_YEAR }, (_, index) => index);
    const hourly = hourlyFromHalfHourly(halfHourly);
    expect(hourly).toHaveLength(HOURS_PER_YEAR);
    expect(hourly[0]).toBe(0.5);
    expect(hourly[100]).toBe(200.5);
    expect(() => hourlyFromHalfHourly([1, 2])).toThrow('needs 17520 values');
  });

  it('map a real UTC instant to the typical year by month, day and time, dropping 29 February', () => {
    expect(typicalYearHalfHour(new Date('2025-01-01T00:00:00Z'))).toBe(0);
    expect(typicalYearHalfHour(new Date('2024-03-01T00:30:00Z'))).toBe(59 * 48 + 1);
    expect(typicalYearHalfHour(new Date('2025-12-31T23:30:00Z'))).toBe(2 * HOURS_PER_YEAR - 1);
    expect(typicalYearHalfHour(new Date('2024-02-29T12:00:00Z'))).toBeUndefined();
    expect(() => typicalYearHalfHour(new Date('2025-06-01T10:15:00Z'))).toThrow('on the half-hour');
  });
});
