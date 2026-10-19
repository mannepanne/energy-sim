// ABOUT: Tests for heat supply, running cost and carbon, including the spec's worked price check
// ABOUT: The heat-pump-only house pays no gas standing charge; both setups pay the electricity standing charge

import { describe, expect, it } from 'vitest';
import { annualCarbonKg, annualCost } from './costCarbon.ts';
import { readInputs } from './inputs.ts';
import { auxiliaryElectricity, fuelForHeat, pencePerKwhOfHeat } from './supply.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

describe('the worked price check (spec, October–December 2026 price cap)', () => {
  it('heat costs 26.32 ÷ 2.8 ≈ 9.40p from the heat pump and 7.97 ÷ 0.85 ≈ 9.38p from the boiler, to 0.01p', () => {
    const inputs = readInputs(
      fixtureAccessor({
        'prices.electricityUnitRate': 26.32,
        'prices.gasUnitRate': 7.97,
        'heating.heatPumpSpf': 2.8,
        'heating.boilerSeasonalEfficiency': 0.85,
        'prices.gasStandingCharge': 29.68,
      }),
    );
    expect(Math.abs(pencePerKwhOfHeat(inputs.electricityUnitRatePence, inputs.heatPumpSpf) - 9.4)).toBeLessThan(0.01);
    expect(Math.abs(pencePerKwhOfHeat(inputs.gasUnitRatePence, inputs.boilerSeasonalEfficiency) - 9.38)).toBeLessThan(0.01);
    const gasHouse = annualCost({ gasKwh: 0, electricityKwh: 0, hasGasSupply: true }, inputs);
    expect(gasHouse.gasStandingPounds).toBeCloseTo(108.33, 2);
  });

  it('rejects a non-positive efficiency', () => {
    expect(() => pencePerKwhOfHeat(8, 0)).toThrow('must be positive');
    expect(() => fuelForHeat(new Float64Array(3), Number.NaN)).toThrow('must be positive');
  });
});

describe('fuelForHeat', () => {
  it('divides every hour by the efficiency, so fuel scales exactly with 1 ÷ efficiency', () => {
    const heat = Float64Array.from([0, 1, 2.5]);
    expect([...fuelForHeat(heat, 0.8)]).toEqual([0, 1.25, 3.125]);
    expect([...fuelForHeat(heat, 2.5)]).toEqual([0, 0.4, 1]);
  });
});

describe('annualCost', () => {
  const inputs = readInputs(fixtureAccessor());

  it('charges unit rates and both standing charges to a house with gas', () => {
    const cost = annualCost({ gasKwh: 10_000, electricityKwh: 3_000, hasGasSupply: true }, inputs);
    expect(cost.gasUnitPounds).toBeCloseTo(800, 9);
    expect(cost.gasStandingPounds).toBeCloseTo(109.5, 9);
    expect(cost.electricityUnitPounds).toBeCloseTo(750, 9);
    expect(cost.electricityStandingPounds).toBeCloseTo(182.5, 9);
    expect(cost.totalPounds).toBeCloseTo(1842, 9);
  });

  it('charges no gas standing charge to a house with no gas supply, but still the electricity one', () => {
    const cost = annualCost({ gasKwh: 0, electricityKwh: 3_000, hasGasSupply: false }, inputs);
    expect(cost.gasStandingPounds).toBe(0);
    expect(cost.electricityStandingPounds).toBeCloseTo(182.5, 9);
    expect(cost.totalPounds).toBeCloseTo(932.5, 9);
  });

  it('refuses gas use in a house with no gas supply', () => {
    expect(() => annualCost({ gasKwh: 1, electricityKwh: 0, hasGasSupply: false }, inputs)).toThrow('no gas supply');
  });
});

describe('annualCarbonKg', () => {
  it('is gas kWh × gas factor + electricity kWh × grid factor', () => {
    expect(annualCarbonKg({ gasKwh: 10_000, electricityKwh: 3_000 }, readInputs(fixtureAccessor()))).toBeCloseTo(2300, 9);
  });
});

describe('auxiliaryElectricity', () => {
  it('spreads the year’s pump and fan electricity in proportion to each hour’s gas', () => {
    expect([...auxiliaryElectricity(Float64Array.from([0, 1, 3]), 80)]).toEqual([0, 20, 60]);
  });

  it('gives none when the boiler never fires, and rejects a negative amount', () => {
    expect([...auxiliaryElectricity(new Float64Array(2), 80)]).toEqual([0, 0]);
    expect(() => auxiliaryElectricity(new Float64Array(2), -1)).toThrow('must not be negative');
  });
});
