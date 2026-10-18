// ABOUT: Tests for the pre-registered NEED readings and the archetype flag rule
// ABOUT: Pins the readings, so a change to the pre-registration shows up as a failing test

import { describe, expect, it } from 'vitest';
import { archetypeGap, FLAG_THRESHOLD, NEED_READING_INPUTS, needReadings } from './needReadings.ts';

describe('the pre-registered NEED readings', () => {
  it('reproduce phase 1’s readings A and C for the 1930s semi', () => {
    const readings = needReadings('semi1930s');
    expect(readings.readingTKwh).toBeCloseTo(15_433.08, 2);
    expect(readings.readingSKwh).toBeCloseTo(121.98 * 90, 6);
    expect(Math.round(readings.lowKwh)).toBe(10_978);
    expect(readings.highKwh).toBe(readings.readingTKwh);
  });

  it('cover ten archetypes, each with a sample of homes behind reading T', () => {
    expect(Object.keys(NEED_READING_INPUTS)).toHaveLength(10);
    for (const inputs of Object.values(NEED_READING_INPUTS)) expect(inputs.sampleSize).toBeGreaterThan(1_000);
  });

  it('order the interval ends whichever reading is larger', () => {
    for (const archetype of Object.keys(NEED_READING_INPUTS) as (keyof typeof NEED_READING_INPUTS)[]) {
      const readings = needReadings(archetype);
      expect(readings.lowKwh).toBeLessThanOrEqual(readings.highKwh);
      expect([readings.readingTKwh, readings.readingSKwh]).toContain(readings.lowKwh);
    }
  });
});

describe('the flag rule', () => {
  const interval = { lowKwh: 10_000, highKwh: 12_000 };

  it('gives no gap inside the interval, including at its ends', () => {
    expect(archetypeGap(10_000, interval)).toEqual({ gap: 0, flagged: false });
    expect(archetypeGap(11_000, interval)).toEqual({ gap: 0, flagged: false });
    expect(archetypeGap(12_000, interval)).toEqual({ gap: 0, flagged: false });
  });

  it('measures the gap from the nearer end, as a share of that end', () => {
    expect(archetypeGap(15_000, interval).gap).toBeCloseTo(0.25, 12);
    expect(archetypeGap(7_000, interval).gap).toBeCloseTo(-0.3, 12);
  });

  it('flags only a gap above 25%', () => {
    expect(FLAG_THRESHOLD).toBe(0.25);
    expect(archetypeGap(15_000, interval).flagged).toBe(false);
    expect(archetypeGap(15_001, interval).flagged).toBe(true);
    expect(archetypeGap(7_499, interval).flagged).toBe(true);
    expect(archetypeGap(7_501, interval).flagged).toBe(false);
  });
});
