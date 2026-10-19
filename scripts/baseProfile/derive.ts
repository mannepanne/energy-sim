// ABOUT: Derives the base electricity profile rows from Elexon's average profile class 1 data
// ABOUT: An hour-of-week shape and a month level, on the reference year's calendar, with Elexon's season rules

import { DAYS_PER_WEEK, firstDayWeekday, REFERENCE_YEAR } from '../../src/engine/calendar.ts';
import { DAYS_PER_YEAR, HOURS_PER_DAY, MONTHS_PER_YEAR } from '../../src/engine/constants.ts';

export const SEASONS = ['Wtr', 'Spr', 'Smr', 'Hsr', 'Aut'] as const;
export type Season = (typeof SEASONS)[number];
export const DAY_TYPES = ['Wd', 'Sat', 'Sun'] as const;
export type DayType = (typeof DAY_TYPES)[number];

export type ColumnName = `${Season} ${DayType}`;

/** Elexon's column names, such as "Wtr Wd", in season then day-type order. */
export const COLUMN_NAMES: readonly ColumnName[] = SEASONS.flatMap((season) => DAY_TYPES.map((type): ColumnName => `${season} ${type}`));

/** Elexon's columns by name: 48 half-hourly mean demands (kW), local clock time, 00:00–00:30 first. */
export type ProfileClassData = ReadonlyMap<string, readonly number[]>;

const HALF_HOURS_PER_DAY = 2 * HOURS_PER_DAY;
const MS_PER_DAY = 86_400_000;
const SATURDAY = 6;
const SUNDAY = 0;
const MONDAY = 1;

/** Day of the year (0-based) of a UTC date. */
const dayIndex = (year: number, month: number, day: number): number => (Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY;

/** The last given weekday (0 Sunday … 6 Saturday) of a month (0-based), as a day of the year. */
function lastWeekdayOf(year: number, month: number, weekday: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const back = (lastDay.getUTCDay() - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return dayIndex(year, month, lastDay.getUTCDate() - back);
}

export interface SeasonStarts {
  spring: number;
  summer: number;
  highSummer: number;
  autumn: number;
  winter: number;
}

/**
 * Elexon's seasons as days of the year: winter runs from the October clock change to the day before the March one;
 * spring from the March clock change to the Friday before summer; summer is the ten weeks from the sixteenth Saturday
 * before the August bank holiday (the last Monday in August); high summer the six weeks and two days from the sixth
 * Saturday before it, to the Sunday after it; autumn from the Monday after the bank holiday to the October clock change.
 */
export function seasonStarts(year: number = REFERENCE_YEAR): SeasonStarts {
  const bankHoliday = lastWeekdayOf(year, 7, MONDAY);
  const saturdayBefore = bankHoliday - (MONDAY - SATURDAY + DAYS_PER_WEEK);
  return {
    spring: lastWeekdayOf(year, 2, SUNDAY),
    summer: saturdayBefore - 15 * DAYS_PER_WEEK,
    highSummer: saturdayBefore - 5 * DAYS_PER_WEEK,
    autumn: bankHoliday + DAYS_PER_WEEK,
    winter: lastWeekdayOf(year, 9, SUNDAY),
  };
}

export function seasonOf(day: number, starts: SeasonStarts): Season {
  if (day < starts.spring || day >= starts.winter) return 'Wtr';
  if (day < starts.summer) return 'Spr';
  if (day < starts.highSummer) return 'Smr';
  if (day < starts.autumn) return 'Hsr';
  return 'Aut';
}

/** Monday 0 to Sunday 6, as the calendar module counts. */
const dayTypeOf = (weekday: number): DayType => (weekday === 5 ? 'Sat' : weekday === 6 ? 'Sun' : 'Wd');

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/** An hour's mean demand from its two half-hours, which over one hour is its kWh. */
const hourly = (column: readonly number[], hour: number): number => (column[2 * hour]! + column[2 * hour + 1]!) / 2;

const zeros = (length: number): number[] => Array.from({ length }, () => 0);

function checkColumns(data: ProfileClassData): void {
  for (const name of COLUMN_NAMES) {
    const values = data.get(name);
    if (values === undefined) throw new Error(`Column "${name}" is missing`);
    if (values.length !== HALF_HOURS_PER_DAY) throw new Error(`Column "${name}" has ${values.length} half-hours, not ${HALF_HOURS_PER_DAY}`);
  }
}

export interface BaseProfile {
  /** 168 values, Monday 00:00 local first, mean 1. */
  hourOfWeek: number[];
  /** 12 values, January first: each month's mean daily use ÷ the year's, mean over the year's days 1. */
  month: number[];
}

/**
 * The hour-of-week shape is each day type's hourly use, averaged over that day type's days in the year, whatever
 * their season. The month level is each month's mean daily use. Bank holidays count as their weekday.
 * Both are rounded to 4 decimals; the engine rescales the product to the year's base use.
 */
export function deriveBaseProfile(data: ProfileClassData, year: number = REFERENCE_YEAR): BaseProfile {
  checkColumns(data);
  const starts = seasonStarts(year);
  const firstWeekday = firstDayWeekday(year);
  const typeTotals: Record<DayType, number[]> = { Wd: zeros(HOURS_PER_DAY), Sat: zeros(HOURS_PER_DAY), Sun: zeros(HOURS_PER_DAY) };
  const typeDays: Record<DayType, number> = { Wd: 0, Sat: 0, Sun: 0 };
  const monthTotals = zeros(MONTHS_PER_YEAR);
  const monthDays = zeros(MONTHS_PER_YEAR);
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    const type = dayTypeOf((day + firstWeekday) % DAYS_PER_WEEK);
    const column = data.get(`${seasonOf(day, starts)} ${type}`)!;
    const month = new Date(Date.UTC(year, 0, 1 + day)).getUTCMonth();
    typeDays[type] += 1;
    monthDays[month]! += 1;
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      const kwh = hourly(column, hour);
      typeTotals[type][hour]! += kwh;
      monthTotals[month]! += kwh;
    }
  }

  const week: number[] = [];
  for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday += 1) {
    const type = dayTypeOf(weekday);
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) week.push(typeTotals[type][hour]! / typeDays[type]);
  }
  const weekMean = week.reduce((sum, value) => sum + value, 0) / week.length;
  const daily = monthTotals.map((total, month) => total / monthDays[month]!);
  const yearDaily = monthTotals.reduce((sum, value) => sum + value, 0) / DAYS_PER_YEAR;
  return { hourOfWeek: week.map((value) => round4(value / weekMean)), month: daily.map((value) => round4(value / yearDaily)) };
}
