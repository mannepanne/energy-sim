// ABOUT: The time base: engine hours are UTC hours 0–8759 of the typical year; schedules and tariffs are in UK local time
// ABOUT: Converts local-time profiles to engine hours with the UK clock-change rule, and averages half-hourly rates to hours

import { DAYS_PER_YEAR, HOURS_PER_DAY, HOURS_PER_YEAR, MONTHS_PER_YEAR } from './constants.ts';

/**
 * A method setting of the time base (see the time-base ADR). The typical year's months come from different years,
 * so it has no real weekdays or clock-change dates. The engine takes both from this reference year: its clock-change
 * dates, and its weekdays (1 January 2026 is a Thursday), so the clock changes fall on Sundays.
 */
export const REFERENCE_YEAR = 2026;

export const DAYS_PER_WEEK = 7;
export const HOURS_PER_WEEK = DAYS_PER_WEEK * HOURS_PER_DAY;
export const HALF_HOURS_PER_YEAR = 2 * HOURS_PER_YEAR;

const MS_PER_HOUR = 3_600_000;
/** UK clocks change at 01:00 UTC. */
const CLOCK_CHANGE_UTC_HOUR = 1;

/** The UTC instant of 01:00 on the last Sunday of a month (0-based), when UK clocks change. */
function lastSundayChange(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const lastSunday = lastDay.getUTCDate() - lastDay.getUTCDay();
  return Date.UTC(year, month, lastSunday, CLOCK_CHANGE_UTC_HOUR);
}

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The weekday of 1 January in a year, counting Monday as 0. */
export function firstDayWeekday(year: number = REFERENCE_YEAR): number {
  return (new Date(Date.UTC(year, 0, 1)).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

export interface SummerTime {
  /** The first engine hour on British Summer Time (UTC + 1). */
  startHour: number;
  /** The first engine hour back on GMT. */
  endHour: number;
}

/** British Summer Time, from the last Sunday in March to the last Sunday in October, as engine hours. */
export function summerTime(year: number = REFERENCE_YEAR): SummerTime {
  if (!Number.isSafeInteger(year) || isLeapYear(year)) {
    throw new Error(`The reference year must be a whole, non-leap year so its days match the typical year, got ${year}`);
  }
  const yearStart = Date.UTC(year, 0, 1);
  return {
    startHour: (lastSundayChange(year, 2) - yearStart) / MS_PER_HOUR,
    endHour: (lastSundayChange(year, 9) - yearStart) / MS_PER_HOUR,
  };
}

export interface Calendar {
  summerTime: SummerTime;
  /** Hours added to UTC to give UK local time: 0 or 1. */
  utcOffsetHours: Uint8Array;
  /** Local hour of the day, 0–23. */
  localHourOfDay: Uint8Array;
  /** Local day of the year, 0–364. */
  localDayOfYear: Uint16Array;
  /** Local weekday, Monday 0 to Sunday 6, as in the reference year. */
  weekday: Uint8Array;
  /** Local hour of the week, 0 (Monday 00:00) to 167 (Sunday 23:00). */
  hourOfWeek: Uint8Array;
  /** Local month, 0 (January) to 11. */
  month: Uint8Array;
}

/**
 * For each engine hour, its UK local time. On the day the clocks go forward, local 01:00 has no engine hour; on the
 * day they go back, local 01:00 has two, so a local-time profile applies its 01:00 value twice that night.
 */
export function buildCalendar(year: number = REFERENCE_YEAR): Calendar {
  const time = summerTime(year);
  const firstWeekday = firstDayWeekday(year);
  const calendar: Calendar = {
    summerTime: time,
    utcOffsetHours: new Uint8Array(HOURS_PER_YEAR),
    localHourOfDay: new Uint8Array(HOURS_PER_YEAR),
    localDayOfYear: new Uint16Array(HOURS_PER_YEAR),
    weekday: new Uint8Array(HOURS_PER_YEAR),
    hourOfWeek: new Uint8Array(HOURS_PER_YEAR),
    month: new Uint8Array(HOURS_PER_YEAR),
  };
  const monthOfDay = Uint8Array.from({ length: DAYS_PER_YEAR }, (_, day) => new Date(Date.UTC(year, 0, 1 + day)).getUTCMonth());
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const offset = hour >= time.startHour && hour < time.endHour ? 1 : 0;
    const local = hour + offset;
    const day = Math.floor(local / HOURS_PER_DAY);
    const hourOfDay = local % HOURS_PER_DAY;
    const weekday = (day + firstWeekday) % DAYS_PER_WEEK;
    calendar.utcOffsetHours[hour] = offset;
    calendar.localHourOfDay[hour] = hourOfDay;
    calendar.localDayOfYear[hour] = day;
    calendar.weekday[hour] = weekday;
    calendar.hourOfWeek[hour] = weekday * HOURS_PER_DAY + hourOfDay;
    calendar.month[hour] = monthOfDay[day]!;
  }
  return calendar;
}

/** The calendar of the reference year, which every local-time profile, schedule and tariff uses. Built once. */
export const REFERENCE_CALENDAR: Calendar = buildCalendar();

/** Throws unless a profile has the number of values its resolution needs. */
export function checkProfileLength(values: ArrayLike<number>, expected: number, what: string): void {
  if (values.length !== expected) throw new Error(`A ${what} profile needs ${expected} values, got ${values.length}`);
}

/** An hour-of-week profile (168 values, Monday 00:00 local first) as a value for every engine hour. */
export function expandWeekly(values: ArrayLike<number>, calendar: Calendar): Float64Array {
  checkProfileLength(values, HOURS_PER_WEEK, 'weekly');
  return Float64Array.from(calendar.hourOfWeek, (hourOfWeek) => values[hourOfWeek]!);
}

/** An hour-of-day profile (24 values, local midnight first) as a value for every engine hour. */
export function expandDaily(values: ArrayLike<number>, calendar: Calendar): Float64Array {
  checkProfileLength(values, HOURS_PER_DAY, 'daily');
  return Float64Array.from(calendar.localHourOfDay, (hourOfDay) => values[hourOfDay]!);
}

/** A month profile (12 values, January first, by local date) as a value for every engine hour. */
export function expandMonthly(values: ArrayLike<number>, calendar: Calendar): Float64Array {
  checkProfileLength(values, MONTHS_PER_YEAR, 'monthly');
  return Float64Array.from(calendar.month, (month) => values[month]!);
}

/** Half-hourly values over the typical year (17,520, UTC, starting 00:00 on 1 January) as hourly means. */
export function hourlyFromHalfHourly(halfHourly: ArrayLike<number>): Float64Array {
  checkProfileLength(halfHourly, HALF_HOURS_PER_YEAR, 'half-hourly');
  const hourly = new Float64Array(HOURS_PER_YEAR);
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) hourly[hour] = (halfHourly[2 * hour]! + halfHourly[2 * hour + 1]!) / 2;
  return hourly;
}

const NON_LEAP_YEAR = 2025; // any non-leap year: only month, day and time of day carry over

/**
 * The typical-year half-hour (0–17,519) for a real UTC instant, matched by calendar date (month and day) and time.
 * Returns undefined for 29 February, which the typical year does not have. The instant must fall on a half-hour.
 */
export function typicalYearHalfHour(utc: Date): number | undefined {
  const month = utc.getUTCMonth();
  const day = utc.getUTCDate();
  if (month === 1 && day === 29) return undefined;
  if (utc.getUTCSeconds() !== 0 || utc.getUTCMilliseconds() !== 0 || utc.getUTCMinutes() % 30 !== 0) {
    throw new Error(`Expected a time on the half-hour, got ${utc.toISOString()}`);
  }
  const sameInstant = Date.UTC(NON_LEAP_YEAR, month, day, utc.getUTCHours(), utc.getUTCMinutes());
  return (sameInstant - Date.UTC(NON_LEAP_YEAR, 0, 1)) / (MS_PER_HOUR / 2);
}
