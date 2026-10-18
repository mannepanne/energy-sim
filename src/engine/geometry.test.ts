// ABOUT: Tests for the heat loss coefficient: the hand-calculated fixture house in REFERENCE/engine.md
// ABOUT: is reproduced exactly, the fabric quality factor scales H, and bad inputs are rejected

import { describe, expect, it } from 'vitest';
import { heatLoss } from './geometry.ts';
import { readInputs } from './inputs.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

describe('heatLoss', () => {
  it('reproduces the fixture house by hand: 200 W/K fabric + 66 W/K ventilation = 266 W/K', () => {
    const loss = heatLoss(readInputs(fixtureAccessor()));
    expect(loss.fabricWPerK).toBe(200);
    expect(loss.ventilationWPerK).toBeCloseTo(66, 12);
    expect(loss.totalWPerK).toBeCloseTo(266, 12);
  });

  it('multiplies fabric and ventilation by the fabric quality factor', () => {
    expect(heatLoss(readInputs(fixtureAccessor({ 'fabric.qualityFactor': 0.9 }))).totalWPerK).toBeCloseTo(239.4, 12);
  });

  it('uses the no-loft-insulation roof in the variant: 50 m² × (2.0 − 0.5) adds 75 W/K', () => {
    expect(heatLoss(readInputs(fixtureAccessor(), { variant: 'noLoftInsulation' })).totalWPerK).toBeCloseTo(341, 12);
  });

  it('rejects negative areas, U-values, air change rates and volumes, and a non-positive quality factor', () => {
    const inputs = readInputs(fixtureAccessor());
    expect(() => heatLoss({ ...inputs, doorAreaM2: -1 })).toThrow('Element "door" has a negative area or U-value');
    expect(() => heatLoss({ ...inputs, wallUValue: -1 })).toThrow('"external walls"');
    expect(() => heatLoss({ ...inputs, airChangesPerHour: -1 })).toThrow('must not be negative');
    expect(() => heatLoss({ ...inputs, heatedVolumeM3: -1 })).toThrow('must not be negative');
    expect(() => heatLoss({ ...inputs, fabricQualityFactor: 0 })).toThrow('must be positive');
  });
});
