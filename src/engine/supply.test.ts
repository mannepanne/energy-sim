// ABOUT: Tests for base electricity by hour: the weekly shape × month level, rescaled to the year's base use
// ABOUT: Gas for heat and the boiler's pump and fan are tested in costCarbon.test.ts

import { describe, expect, it } from 'vitest';
import { buildCalendar, HOURS_PER_WEEK } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { baseElectricityKwh } from './supply.ts';

const calendar = buildCalendar();
const even = { weekly: Array.from({ length: HOURS_PER_WEEK }, () => 1), monthly: Array.from({ length: 12 }, () => 1) };
const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

describe('baseElectricityKwh', () => {
  it('spreads the year evenly with even profiles', () => {
    const base = baseElectricityKwh(
      { baseElectricityKwhPerYear: 2920, baseElectricityWeeklyProfile: even.weekly, baseElectricityMonthlyProfile: even.monthly },
      calendar,
    );
    expect(base).toHaveLength(HOURS_PER_YEAR);
    for (const value of base) expect(value).toBeCloseTo(2920 / HOURS_PER_YEAR, 12);
  });

  it('keeps the year’s total, and puts twice as much in an evening hour weighted 2 and in a month weighted 2', () => {
    const weekly = even.weekly.map((_, hour) => (hour % 24 === 18 ? 2 : 1));
    const monthly = even.monthly.map((_, month) => (month === 0 ? 2 : 1));
    const base = baseElectricityKwh({ baseElectricityKwhPerYear: 3000, baseElectricityWeeklyProfile: weekly, baseElectricityMonthlyProfile: monthly }, calendar);
    expect(sum(base)).toBeCloseTo(3000, 9);
    // 1 January (GMT): 18:00 is twice 12:00; 1 February 12:00 is half of 1 January 12:00.
    expect(base[18]! / base[12]!).toBeCloseTo(2, 12);
    expect(base[12]! / base[31 * 24 + 12]!).toBeCloseTo(2, 12);
  });

  it('follows local time: in summer, local 18:00 is 17:00 UTC', () => {
    const weekly = even.weekly.map((_, hour) => (hour % 24 === 18 ? 2 : 1));
    const base = baseElectricityKwh({ baseElectricityKwhPerYear: 3000, baseElectricityWeeklyProfile: weekly, baseElectricityMonthlyProfile: even.monthly }, calendar);
    const july1 = 181 * 24;
    expect(base[july1 + 17]! / base[july1 + 12]!).toBeCloseTo(2, 12);
  });

  it('rejects profiles of the wrong length', () => {
    expect(() => baseElectricityKwh({ baseElectricityKwhPerYear: 1, baseElectricityWeeklyProfile: [1], baseElectricityMonthlyProfile: even.monthly }, calendar)).toThrow(
      'A weekly profile needs 168 values, got 1',
    );
    expect(() => baseElectricityKwh({ baseElectricityKwhPerYear: 1, baseElectricityWeeklyProfile: even.weekly, baseElectricityMonthlyProfile: [1] }, calendar)).toThrow(
      'A monthly profile needs 12 values, got 1',
    );
  });

  it('throws when the profile is zero everywhere', () => {
    expect(() =>
      baseElectricityKwh({ baseElectricityKwhPerYear: 1, baseElectricityWeeklyProfile: even.weekly.map(() => 0), baseElectricityMonthlyProfile: even.monthly }, calendar),
    ).toThrow('zero in every hour');
  });
});
