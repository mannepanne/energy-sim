// ABOUT: Tests for deriving the base electricity profile: Elexon's season dates, the weekly shape and month level
// ABOUT: Also reads a small spreadsheet XML in Elexon's layout, and checks the committed rows have the derived form

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { COLUMN_NAMES, deriveBaseProfile, seasonOf, seasonStarts, type ProfileClassData } from './derive.ts';
import { readProfileClass1 } from './sheet.ts';

/** Day of 2026 (0 = 1 January) for a month (1-based) and day. */
const day = (month: number, date: number): number => (Date.UTC(2026, month - 1, date) - Date.UTC(2026, 0, 1)) / 86_400_000;

const flat = (value: number): number[] => Array.from({ length: 48 }, () => value);
const uniform = (value: (name: string) => number[]): ProfileClassData => new Map(COLUMN_NAMES.map((name) => [name, value(name)]));

describe('seasonStarts (Elexon’s rules, 2026)', () => {
  const starts = seasonStarts(2026);

  it('starts spring and winter on the clock changes, 29 March and 25 October', () => {
    expect(starts.spring).toBe(day(3, 29));
    expect(starts.winter).toBe(day(10, 25));
  });

  it('counts summer, high summer and autumn from the August bank holiday, 31 August', () => {
    expect(starts.summer).toBe(day(5, 16)); // the sixteenth Saturday before
    expect(starts.highSummer).toBe(day(7, 25)); // the sixth Saturday before
    expect(starts.autumn).toBe(day(9, 7)); // the Monday after
    expect(starts.highSummer - starts.summer).toBe(70); // ten weeks
    expect(starts.autumn - starts.highSummer).toBe(44); // six weeks and two days
  });

  it('puts each day in one season', () => {
    expect(seasonOf(0, starts)).toBe('Wtr');
    expect(seasonOf(day(3, 28), starts)).toBe('Wtr');
    expect(seasonOf(day(3, 29), starts)).toBe('Spr');
    expect(seasonOf(day(6, 1), starts)).toBe('Smr');
    expect(seasonOf(day(8, 1), starts)).toBe('Hsr');
    expect(seasonOf(day(10, 1), starts)).toBe('Aut');
    expect(seasonOf(364, starts)).toBe('Wtr');
  });
});

describe('deriveBaseProfile', () => {
  it('gives even profiles from flat data', () => {
    const profile = deriveBaseProfile(uniform(() => flat(0.5)));
    expect(profile.hourOfWeek).toHaveLength(168);
    expect(profile.month).toHaveLength(12);
    expect(new Set(profile.hourOfWeek)).toEqual(new Set([1]));
    expect(new Set(profile.month)).toEqual(new Set([1]));
  });

  it('averages each hour’s two half-hours, and gives Saturdays and Sundays their own shape', () => {
    const data = uniform((name) => (name.endsWith('Sun') ? flat(1) : Array.from({ length: 48 }, (_, half) => (half === 36 ? 3 : 1))));
    const { hourOfWeek } = deriveBaseProfile(data);
    // Weekdays and Saturdays: hour 18 is (3 + 1) ÷ 2 = 2, the rest 1; Sundays are flat.
    const mean = (6 * (23 + 2) + 24) / 168;
    expect(hourOfWeek[18]).toBeCloseTo(2 / mean, 4);
    expect(hourOfWeek[12]).toBeCloseTo(1 / mean, 4);
    expect(hourOfWeek[5 * 24 + 18]).toBeCloseTo(2 / mean, 4);
    expect(hourOfWeek[6 * 24 + 18]).toBeCloseTo(1 / mean, 4);
  });

  it('raises the months that are mostly winter', () => {
    const data = uniform((name) => flat(name.startsWith('Wtr') ? 2 : 1));
    const { month } = deriveBaseProfile(data);
    expect(month[0]).toBeGreaterThan(month[6]!);
    expect(month[0]! / month[6]!).toBeCloseTo(2, 3);
    // March is winter for 28 days, spring for 3.
    expect(month[2]! / month[6]!).toBeCloseTo((28 * 2 + 3) / 31, 3);
  });

  it('rejects a missing or short column', () => {
    const data = new Map(uniform(() => flat(1)));
    data.delete('Aut Sun');
    expect(() => deriveBaseProfile(data)).toThrow('"Aut Sun" is missing');
    expect(() => deriveBaseProfile(uniform(() => [1]))).toThrow('has 1 half-hours');
  });
});

/** A minimal sheet in Elexon's layout: A1 names the class, row 3 the columns, rows 4–51 the half-hours. */
function sheetXml(header: readonly string[], value: (column: number, half: number) => string): { sheet: string; strings: string } {
  const strings = ['Profile Class 1', 'Settlement period', ...header];
  const letters = 'BCDEFGHIJKLMNOP';
  const rows = [
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="7"/></row>',
    `<row r="3"><c r="A3" t="s"><v>1</v></c>${header.map((_, index) => `<c r="${letters[index]}3" t="s"><v>${index + 2}</v></c>`).join('')}</row>`,
    ...Array.from({ length: 48 }, (_, half) => {
      const cells = header.map((_name, index) => `<c r="${letters[index]}${half + 4}" s="6"><v>${value(index, half)}</v></c>`).join('');
      return `<row r="${half + 4}"><c r="A${half + 4}"><v>${(half + 1) / 48}</v></c>${cells}</row>`;
    }),
  ];
  return {
    sheet: `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
    strings: `<sst>${strings.map((text) => `<si><t>${text}</t></si>`).join('')}</sst>`,
  };
}

describe('readProfileClass1', () => {
  it('reads the fifteen columns by their header names', () => {
    const { sheet, strings } = sheetXml(COLUMN_NAMES, (column, half) => String(column + half / 100));
    const data = readProfileClass1(sheet, strings);
    expect(data.size).toBe(15);
    expect(data.get('Wtr Wd')![0]).toBe(0);
    expect(data.get('Aut Sun')![47]).toBeCloseTo(14.47, 12);
  });

  it('rejects another class, an unknown header, a missing value and a repeated column', () => {
    const good = sheetXml(COLUMN_NAMES, () => '1');
    expect(() => readProfileClass1(good.sheet.replace('<v>0</v>', '<v>1</v>'), good.strings)).toThrow('"Profile Class 1"');
    const unknown = sheetXml([...COLUMN_NAMES.slice(0, 14), 'Odd Day'], () => '1');
    expect(() => readProfileClass1(unknown.sheet, unknown.strings)).toThrow('Unexpected header');
    const blank = sheetXml(COLUMN_NAMES, (column, half) => (column === 3 && half === 10 ? '-1' : '1'));
    expect(() => readProfileClass1(blank.sheet, blank.strings)).toThrow('Expected a demand in E14');
    const repeated = sheetXml([...COLUMN_NAMES.slice(0, 14), COLUMN_NAMES[0]!], () => '1');
    expect(() => readProfileClass1(repeated.sheet, repeated.strings)).toThrow('15 distinct columns');
  });
});

describe('the committed base profile rows', () => {
  const access = createAccessor(loadRegister(JSON.parse(readFileSync(new URL('../../data/register.json', import.meta.url), 'utf8')) as unknown));
  const weekly = access.profile('electricity.baseProfileWeekly').values;
  const monthly = access.profile('electricity.baseProfileMonthly').values;

  it('have the derived form: a weekly shape with mean 1, the same on every weekday, and a month level near 1', () => {
    expect(weekly.reduce((sum, value) => sum + value, 0) / 168).toBeCloseTo(1, 3);
    for (let weekday = 1; weekday < 5; weekday += 1) expect(weekly.slice(weekday * 24, weekday * 24 + 24)).toEqual(weekly.slice(0, 24));
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    expect(monthly.reduce((sum, value, month) => sum + value * days[month]!, 0) / 365).toBeCloseTo(1, 3);
  });

  it('peak on weekday evenings and dip overnight, with winter months above summer ones', () => {
    const weekday = weekly.slice(0, 24);
    expect(Math.max(...weekday)).toBe(weekday[18]);
    expect(Math.min(...weekday)).toBe(weekday[3]);
    expect(monthly[0]! / monthly[6]!).toBeGreaterThan(1.2);
  });
});
