// ABOUT: Tests for the hot water cylinder: never below its minimum at the end of an hour, a forced reheat to the
// ABOUT: setpoint, and an energy balance that closes over the year

import { describe, expect, it } from 'vitest';
import { HOURS_PER_YEAR } from './constants.ts';
import { checkCylinder, runCylinder, storedHeatKwh, type Cylinder } from './cylinder.ts';
import { CHEAP, PEAK } from './tariffs.ts';

const cylinder: Cylinder = { volumeLitres: 200, setpointC: 50, minimumC: 45, coldFeedC: 10, standingLossKwhPerDay: 1.2 };
const full = storedHeatKwh(cylinder, 50);
const minimum = storedHeatKwh(cylinder, 45);

/** A morning and an evening draw every day, 2 and 3 kWh. */
const draws = Float64Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour % 24 === 7 ? 2 : hour % 24 === 19 ? 3 : 0));
const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

describe('the cylinder', () => {
  const run = runCylinder(draws, cylinder);

  it('stores V × 4.18 × (T − T_cold) ÷ 3,600 kWh: 200 litres at 50 °C over a 10 °C feed is 9.289 kWh', () => {
    expect(full).toBeCloseTo((200 * 4.18 * 40) / 3600, 12);
    expect(run.initialStoredKwh).toBe(full);
    expect(run.minimumStoredKwh).toBe(minimum);
  });

  it('never ends an hour below its minimum or above its setpoint', () => {
    for (const stored of run.storedKwh) {
      expect(stored).toBeGreaterThanOrEqual(minimum);
      expect(stored).toBeLessThanOrEqual(full + 1e-12);
    }
  });

  it('reheats to the setpoint only in hours it falls below the minimum, even when one draw exceeds the whole band', () => {
    // The band between minimum and setpoint is 1.16 kWh, so both daily draws force a reheat in their own hour.
    expect(run.reheatKwh[7]).toBeCloseTo(2 + 8 * 0.05, 12);
    expect(run.storedKwh[7]).toBe(full);
    expect(run.reheatKwh[8]).toBe(0);
    expect(run.storedKwh[8]).toBeCloseTo(full - 0.05, 12);
  });

  it('closes its energy balance over the year: reheats = draws + standing loss − the fall in stored heat', () => {
    const fall = run.initialStoredKwh - run.storedKwh[HOURS_PER_YEAR - 1]!;
    expect(sum(run.reheatKwh)).toBeCloseTo(sum(draws) + 365 * 1.2 - fall, 9);
  });

  it('reheats for standing loss alone when nothing is drawn', () => {
    const idle = runCylinder(new Float64Array(HOURS_PER_YEAR), cylinder);
    const fall = idle.initialStoredKwh - idle.storedKwh[HOURS_PER_YEAR - 1]!;
    expect(sum(idle.reheatKwh)).toBeCloseTo(365 * 1.2 - fall, 9);
    expect(sum(idle.reheatKwh)).toBeGreaterThan(0);
  });

  it('rejects a cylinder whose temperatures are out of order, or with no volume or a negative loss', () => {
    expect(() => checkCylinder({ ...cylinder, minimumC: 50 })).toThrow('cold feed < minimum < setpoint');
    expect(() => checkCylinder({ ...cylinder, minimumC: 5 })).toThrow('cold feed < minimum < setpoint');
    expect(() => checkCylinder({ ...cylinder, volumeLitres: 0 })).toThrow('volume must be positive');
    expect(() => checkCylinder({ ...cylinder, standingLossKwhPerDay: -1 })).toThrow('must not be negative');
    expect(() => checkCylinder(cylinder)).not.toThrow();
  });
});

describe('the cylinder under control', () => {
  // Cheap from 02:00 to 05:00 and peak from 17:00 to 20:00 every day. Small draws, 0.3 kWh at 07:00 and 19:00, which
  // the 1.16 kWh between setpoint and minimum covers, so the morning draw comes from heat stored in the cheap hours.
  const smallDraws = Float64Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour % 24 === 7 || hour % 24 === 19 ? 0.3 : 0));
  const band = Int8Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour % 24 >= 2 && hour % 24 < 5 ? CHEAP : hour % 24 >= 17 && hour % 24 < 20 ? PEAK : 0));
  const free = runCylinder(smallDraws, cylinder);
  const controlled = runCylinder(smallDraws, cylinder, band);

  it('fills to the setpoint in every cheap hour, reheats only to the minimum outside them, and never ends an hour below it', () => {
    const stores = Array.from(controlled.storedKwh);
    expect(Math.min(...stores)).toBeGreaterThanOrEqual(minimum);
    const afterCheap = stores.filter((_, hour) => band[hour] === CHEAP);
    const afterOtherReheats = stores.filter((_, hour) => band[hour] !== CHEAP && controlled.reheatKwh[hour]! > 0);
    expect(afterCheap.every((stored) => Math.abs(stored - full) < 1e-12)).toBe(true);
    expect(afterOtherReheats.length).toBeGreaterThan(0);
    expect(afterOtherReheats.every((stored) => Math.abs(stored - minimum) < 1e-12)).toBe(true);
  });

  it('moves reheats into cheap hours', () => {
    const inCheap = (reheat: Float64Array): number => sum(reheat.filter((_, hour) => band[hour] === CHEAP));
    expect(inCheap(controlled.reheatKwh) / sum(controlled.reheatKwh)).toBeGreaterThan(inCheap(free.reheatKwh) / sum(free.reheatKwh));
    expect(inCheap(controlled.reheatKwh) / sum(controlled.reheatKwh)).toBeGreaterThan(0.5);
  });

  it('closes its energy balance, so topping up moves heat in time without adding any', () => {
    const balance = (run: typeof free): number => sum(run.reheatKwh) + (run.initialStoredKwh - run.storedKwh.at(-1)!);
    expect(balance(controlled)).toBeCloseTo(sum(smallDraws) + 365 * cylinder.standingLossKwhPerDay, 9);
    expect(balance(controlled)).toBeCloseTo(balance(free), 9);
  });

  it('rejects bands of the wrong length', () => {
    expect(() => runCylinder(smallDraws, cylinder, new Int8Array(10))).toThrow(/bands have 10 hours/);
  });
});
