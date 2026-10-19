// ABOUT: Tests for roof solar PV: the roof maximum by hand, generation with and without temperature losses,
// ABOUT: and how each hour's generation is shared between the loads and export

import { describe, expect, it } from 'vitest';
import { RADIANS_PER_DEGREE } from './constants.ts';
import { checkPvSystem, pvGenerationKwh, roofMaximumKw, useSolar, type PvSystem } from './pv.ts';

const system: PvSystem = {
  peakPowerKw: 4,
  tilt: 35 * RADIANS_PER_DEGREE,
  azimuth: 0,
  systemLoss: 0.1,
  temperatureCoefficientPerK: 0,
  cellTemperatureRiseKPerWm2: 0,
};

const series = (...values: number[]): Float64Array => Float64Array.from(values);

describe('roofMaximumKw', () => {
  it('is footprint ÷ cos(pitch) × ½ × usable fraction × kWp per m²', () => {
    const roof = { footprintM2: 50, pitch: 35 * RADIANS_PER_DEGREE, usableFraction: 0.7, kwpPerM2: 0.2 };
    expect(roofMaximumKw(roof)).toBeCloseTo((50 / Math.cos(35 * RADIANS_PER_DEGREE)) * 0.5 * 0.7 * 0.2, 12);
    expect(roofMaximumKw(roof)).toBeCloseTo(4.273, 3);
  });

  it('is half the footprint × the fractions for a flat roof', () => {
    expect(roofMaximumKw({ footprintM2: 40, pitch: 0, usableFraction: 1, kwpPerM2: 0.2 })).toBeCloseTo(4, 12);
  });

  it.each([
    [{ footprintM2: 0, pitch: 0.5, usableFraction: 0.7, kwpPerM2: 0.2 }, 'footprint'],
    [{ footprintM2: 50, pitch: Math.PI / 2, usableFraction: 0.7, kwpPerM2: 0.2 }, 'pitch'],
    [{ footprintM2: 50, pitch: 0.5, usableFraction: 0, kwpPerM2: 0.2 }, 'usable roof fraction'],
    [{ footprintM2: 50, pitch: 0.5, usableFraction: 1.1, kwpPerM2: 0.2 }, 'usable roof fraction'],
    [{ footprintM2: 50, pitch: 0.5, usableFraction: 0.7, kwpPerM2: 0 }, 'kWp per m²'],
  ])('rejects a bad roof (%o)', (roof, what) => {
    expect(() => roofMaximumKw(roof)).toThrow(what);
  });
});

describe('pvGenerationKwh', () => {
  it('gives P × G ÷ 1,000 × (1 − loss) with no temperature effect, and nothing in the dark', () => {
    const generation = pvGenerationKwh(series(0, 500, 1000), series(10, 10, 10), system);
    expect([...generation]).toEqual([0, 4 * 0.5 * 0.9, 4 * 0.9]);
  });

  it('loses γ × (T_cell − 25) with T_cell = T_air + rise × G', () => {
    const hot = { ...system, temperatureCoefficientPerK: -0.004, cellTemperatureRiseKPerWm2: 0.03 };
    // T_cell = 20 + 0.03 × 800 = 44 °C, 19 K above 25 °C, so output falls by 7.6%.
    const [generation] = pvGenerationKwh(series(800), series(20), hot);
    expect(generation).toBeCloseTo(4 * 0.8 * 0.9 * (1 - 0.004 * 19), 12);
  });

  it('gains output when the cell is below 25 °C', () => {
    const cold = { ...system, temperatureCoefficientPerK: -0.004 };
    const [generation] = pvGenerationKwh(series(200), series(0), cold);
    expect(generation).toBeGreaterThan(4 * 0.2 * 0.9);
  });

  it('never goes negative, however hot the cell', () => {
    const extreme = { ...system, temperatureCoefficientPerK: -0.05, cellTemperatureRiseKPerWm2: 0.1 };
    expect(pvGenerationKwh(series(1000), series(40), extreme)[0]).toBe(0);
  });

  it('rejects mismatched series', () => {
    expect(() => pvGenerationKwh(series(1, 2), series(1), system)).toThrow('differ in length');
  });
});

describe('checkPvSystem', () => {
  it.each([
    [{ peakPowerKw: -1 }, 'peak power'],
    [{ systemLoss: 1 }, 'system loss'],
    [{ systemLoss: -0.1 }, 'system loss'],
    [{ temperatureCoefficientPerK: 0.001 }, 'temperature coefficient'],
    [{ cellTemperatureRiseKPerWm2: -0.01 }, 'cell temperature rise'],
  ])('rejects %o', (change, what) => {
    expect(() => checkPvSystem({ ...system, ...change })).toThrow(what);
  });

  it('accepts a system of zero size', () => {
    expect(() => checkPvSystem({ ...system, peakPowerKw: 0 })).not.toThrow();
  });
});

describe('useSolar', () => {
  const loads = { baseKwh: series(0.5, 0.5, 0.5, 0.5), heatingKwh: series(1, 1, 1, 0), cylinderKwh: series(0.4, 0.4, 0.4, 0) };

  it('meets base load first, then heating, then the cylinder, and exports the rest', () => {
    const use = useSolar(series(0.3, 1.2, 3, 0), loads);
    expect([...use.exportKwh]).toEqual([0, 0, 3 - 1.9, 0]);
    expect(use.usedByBaseKwh).toBeCloseTo(0.3 + 0.5 + 0.5, 12);
    expect(use.usedByHeatingKwh).toBeCloseTo(0.7 + 1, 12);
    expect(use.usedByCylinderKwh).toBeCloseTo(0.4, 12);
    expect(use.importKwh[0]).toBeCloseTo(0.2 + 1 + 0.4, 12);
    expect(use.importKwh[1]).toBeCloseTo(0.3 + 0.4, 12);
    expect(use.importKwh[2]).toBe(0);
    expect(use.importKwh[3]).toBeCloseTo(0.5, 12);
  });

  it('balances every hour: generation + import = load + export, and export never exceeds generation', () => {
    const generation = series(0.3, 1.2, 3, 0);
    const use = useSolar(generation, loads);
    for (let hour = 0; hour < 4; hour += 1) {
      const load = loads.baseKwh[hour]! + loads.heatingKwh[hour]! + loads.cylinderKwh[hour]!;
      expect(generation[hour]! + use.importKwh[hour]!).toBeCloseTo(load + use.exportKwh[hour]!, 12);
      expect(use.exportKwh[hour]!).toBeLessThanOrEqual(generation[hour]!);
      expect(use.exportKwh[hour]!).toBeGreaterThanOrEqual(0);
    }
  });

  it('imports every load and exports nothing without generation', () => {
    const use = useSolar(new Float64Array(4), loads);
    expect([...use.exportKwh]).toEqual([0, 0, 0, 0]);
    expect(use.importKwh[0]).toBeCloseTo(1.9, 12);
    expect(use.usedByBaseKwh + use.usedByHeatingKwh + use.usedByCylinderKwh).toBe(0);
  });

  it('rejects a load of the wrong length', () => {
    expect(() => useSolar(series(1, 1, 1, 1), { ...loads, cylinderKwh: series(1) })).toThrow('cylinder');
  });
});
