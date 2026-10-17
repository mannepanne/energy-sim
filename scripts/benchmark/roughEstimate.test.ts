// ABOUT: Tests for the benchmark step 1 estimate built from the draft archetype values
// ABOUT: Checks H against a hand calculation and the direction of the roof variants

import { describe, expect, it } from 'vitest';
import { londonClimate, uValues } from './draftValues.ts';
import { roughEstimate } from './roughEstimate.ts';

describe('roughEstimate', () => {
  it('reproduces the hand-calculated H for the age-band-default roof', () => {
    // Net wall 100 − 17.855 − 1.85 = 80.295 m². Walls 80.295 × 1.5 + windows 17.855 × 2.8
    // + door 1.85 × 3.0 + roof 45 × 2.3 + floor 45 × 0.75 = 120.4425 + 49.994 + 5.55 + 103.5 + 33.75
    // = 313.2365; ventilation 0.33 × 1.0 × 225 = 74.25
    const result = roughEstimate(uValues.roofAgeBandDefault.value);
    expect(result.heatLoss.fabricWPerK).toBeCloseTo(313.2365, 3);
    expect(result.heatLoss.ventilationWPerK).toBeCloseTo(74.25, 10);
    expect(result.heatLoss.totalWPerK).toBeCloseTo(387.4865, 3);
  });

  it('gives less space heat with 100 mm of loft insulation than with none', () => {
    const none = roughEstimate(uValues.roofAgeBandDefault.value);
    const insulated = roughEstimate(uValues.roofHundredMillimetres.value);
    expect(insulated.annualSpaceHeatKwh).toBeLessThan(none.annualSpaceHeatKwh);
  });

  it('places the balance point below the mean internal temperature', () => {
    const result = roughEstimate(uValues.roofAgeBandDefault.value);
    expect(result.balancePointC).toBeLessThan(18);
    expect(result.balancePointC).toBeGreaterThan(14);
  });

  it('uses a full year of London climate data', () => {
    expect(londonClimate.months.reduce((sum, month) => sum + month.days, 0)).toBe(365);
  });
});
