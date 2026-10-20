// ABOUT: Tests for solar and internal gains, and hot water
// ABOUT: Hand-calculated values for the fixture house

import { describe, expect, it } from 'vitest';
import { HOURS_PER_YEAR } from './constants.ts';
import { dailyHotWaterKwh, solarGainsW, totalGainsW } from './demand.ts';
import { readInputs } from './inputs.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

const inputs = readInputs(fixtureAccessor());
const constant = (value: number): Float64Array => new Float64Array(HOURS_PER_YEAR).fill(value);

describe('solarGainsW', () => {
  it('is window area × g × frame factor × solar access × irradiance', () => {
    // 10 m² × 0.5 × 0.8 × 1 = 4 m² of transmitting area.
    const gains = solarGainsW(inputs, constant(100));
    expect(gains[0]).toBeCloseTo(400, 12);
    expect(solarGainsW({ ...inputs, solarAccessFactor: 0.5 }, constant(100))[5]).toBeCloseTo(200, 12);
  });
});

describe('totalGainsW', () => {
  it('adds the internal gains (4 occupants × 100 W) to the solar gains each hour', () => {
    const gains = totalGainsW(inputs, constant(100));
    expect(gains).toHaveLength(HOURS_PER_YEAR);
    expect(gains[0]).toBeCloseTo(400 + 400, 12);
    expect(totalGainsW(inputs, constant(0))[10]).toBe(400);
  });
});

describe('hot water', () => {
  it('is L × 4.18 × (T_delivery − T_cold) ÷ 3,600: 100 litres heated by 40 K is 4.644 kWh a day', () => {
    expect(dailyHotWaterKwh(inputs)).toBeCloseTo((100 * 4.18 * 40) / 3600, 12);
    expect(dailyHotWaterKwh(inputs)).toBeCloseTo(4.6444, 4);
  });
});
