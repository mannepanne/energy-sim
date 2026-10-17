// ABOUT: Tests for the rough heat-demand calculation used by benchmark step 1
// ABOUT: Hand-checked values for H, degree days, balance point and annual space heat

import { describe, expect, it } from 'vitest';
import {
  annualDegreeDays,
  annualSpaceHeatKwh,
  balancePointTemperature,
  heatLossCoefficient,
  monthlyDegreeDays,
  type MonthlyClimate,
} from './heatDemand.ts';

describe('heatLossCoefficient', () => {
  it('sums U × A for each element and adds 0.33 × n × V for ventilation', () => {
    const result = heatLossCoefficient({
      elements: [
        { name: 'wall', areaM2: 10, uValueWPerM2K: 1.5 },
        { name: 'roof', areaM2: 20, uValueWPerM2K: 0.5 },
      ],
      airChangesPerHour: 1,
      heatedVolumeM3: 100,
    });
    expect(result.fabricWPerK).toBeCloseTo(25, 10);
    expect(result.ventilationWPerK).toBeCloseTo(33, 10);
    expect(result.totalWPerK).toBeCloseTo(58, 10);
  });

  it('returns zero for a house with no elements and no air change', () => {
    const result = heatLossCoefficient({ elements: [], airChangesPerHour: 0, heatedVolumeM3: 200 });
    expect(result.totalWPerK).toBe(0);
  });

  it('rejects a negative area, U-value, air change rate or volume', () => {
    const wall = { name: 'wall', areaM2: 10, uValueWPerM2K: 1.5 };
    expect(() =>
      heatLossCoefficient({ elements: [{ ...wall, areaM2: -1 }], airChangesPerHour: 1, heatedVolumeM3: 1 }),
    ).toThrow(/wall/);
    expect(() =>
      heatLossCoefficient({ elements: [{ ...wall, uValueWPerM2K: -1 }], airChangesPerHour: 1, heatedVolumeM3: 1 }),
    ).toThrow(/wall/);
    expect(() => heatLossCoefficient({ elements: [wall], airChangesPerHour: -1, heatedVolumeM3: 1 })).toThrow(
      /air change/,
    );
    expect(() => heatLossCoefficient({ elements: [wall], airChangesPerHour: 1, heatedVolumeM3: -1 })).toThrow(
      /volume/,
    );
  });
});

describe('monthlyDegreeDays', () => {
  it('matches the Hitchin formula for a month colder than the base', () => {
    // 31 × 10 / (1 − e^(−7.1)) = 310.2560
    expect(monthlyDegreeDays({ meanTemperatureC: 5, days: 31 }, 15, 0.71)).toBeCloseTo(310.256, 3);
  });

  it('gives N / k when the mean temperature equals the base temperature', () => {
    expect(monthlyDegreeDays({ meanTemperatureC: 15, days: 30 }, 15, 0.71)).toBeCloseTo(30 / 0.71, 10);
  });

  it('is continuous either side of the base temperature', () => {
    const at = monthlyDegreeDays({ meanTemperatureC: 15, days: 30 }, 15, 0.71);
    const justBelow = monthlyDegreeDays({ meanTemperatureC: 15 - 1e-9, days: 30 }, 15, 0.71);
    const justAbove = monthlyDegreeDays({ meanTemperatureC: 15 + 1e-9, days: 30 }, 15, 0.71);
    expect(justBelow).toBeCloseTo(at, 6);
    expect(justAbove).toBeCloseTo(at, 6);
  });

  it('is small but positive for a month 10 K warmer than the base', () => {
    expect(monthlyDegreeDays({ meanTemperatureC: 25, days: 31 }, 15, 0.71)).toBeCloseTo(0.256, 3);
  });

  it('rises as the base temperature rises', () => {
    const month = { meanTemperatureC: 8, days: 30 };
    expect(monthlyDegreeDays(month, 16, 0.71)).toBeGreaterThan(monthlyDegreeDays(month, 15, 0.71));
  });

  it('rejects a non-positive spread constant', () => {
    expect(() => monthlyDegreeDays({ meanTemperatureC: 5, days: 31 }, 15, 0)).toThrow(/k/);
  });
});

describe('annualDegreeDays', () => {
  const twelveMonths: MonthlyClimate[] = Array.from({ length: 12 }, () => ({ meanTemperatureC: 5, days: 30 }));

  it('sums the twelve months', () => {
    const one = monthlyDegreeDays({ meanTemperatureC: 5, days: 30 }, 15, 0.71);
    expect(annualDegreeDays(twelveMonths, 15, 0.71)).toBeCloseTo(12 * one, 10);
  });

  it('rejects anything other than twelve months', () => {
    expect(() => annualDegreeDays(twelveMonths.slice(1), 15, 0.71)).toThrow(/12 months/);
  });
});

describe('balancePointTemperature', () => {
  it('is the mean internal temperature less gains ÷ H', () => {
    expect(balancePointTemperature({ meanInternalTemperatureC: 18, gainsW: 600, heatLossCoefficientWPerK: 300 })).toBe(
      16,
    );
  });

  it('rejects a non-positive H', () => {
    expect(() =>
      balancePointTemperature({ meanInternalTemperatureC: 18, gainsW: 600, heatLossCoefficientWPerK: 0 }),
    ).toThrow(/H/);
  });
});

describe('annualSpaceHeatKwh', () => {
  it('is H × degree days × 24 ÷ 1000', () => {
    expect(annualSpaceHeatKwh(250, 2000)).toBe(12000);
  });
});
