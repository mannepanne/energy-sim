// ABOUT: Tests for hourly space heat, solar gains and hot water
// ABOUT: Hand-calculated values for the fixture house, the zero clamp, and the outdoor-temperature offset

import { describe, expect, it } from 'vitest';
import { HOURS_PER_YEAR } from './constants.ts';
import { dailyHotWaterKwh, evenHourly, hourlySpaceHeatKwh, solarGainsW } from './demand.ts';
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

describe('hourlySpaceHeatKwh', () => {
  it('gives H (T_mean − T_out) − gains each hour: 266 × 15 − 400 = 3,590 W, so 3.59 kWh', () => {
    const heat = hourlySpaceHeatKwh(inputs, 266, constant(5), constant(0));
    expect(heat).toHaveLength(HOURS_PER_YEAR);
    expect(heat[0]).toBeCloseTo(3.59, 12);
  });

  it('is zero in any hour where gains cover the loss', () => {
    const outdoor = constant(5);
    outdoor[100] = 19; // loss 266 W, below the 400 W of internal gains
    const solar = constant(0);
    solar[200] = 4000; // more than the 3,590 W net loss
    const heat = hourlySpaceHeatKwh(inputs, 266, outdoor, solar);
    expect(heat[100]).toBe(0);
    expect(heat[200]).toBe(0);
    expect(heat[101]).toBeGreaterThan(0);
  });

  it('adds the register’s outdoor-temperature offset to every hour', () => {
    const heat = hourlySpaceHeatKwh({ ...inputs, outdoorTemperatureOffsetK: -2 }, 266, constant(5), constant(0));
    expect(heat[0]).toBeCloseTo((266 * 17 - 400) / 1000, 12);
  });

  it('rejects weather of the wrong length', () => {
    expect(() => hourlySpaceHeatKwh(inputs, 266, new Float64Array(24), constant(0))).toThrow('8760 hours');
    expect(() => hourlySpaceHeatKwh(inputs, 266, constant(5), new Float64Array(24))).toThrow('8760 hours');
  });
});

describe('hot water', () => {
  it('is L × 4.18 × (T_delivery − T_cold) ÷ 3,600: 100 litres heated by 40 K is 4.644 kWh a day', () => {
    expect(dailyHotWaterKwh(inputs)).toBeCloseTo((100 * 4.18 * 40) / 3600, 12);
    expect(dailyHotWaterKwh(inputs)).toBeCloseTo(4.6444, 4);
  });

  it('spreads a daily amount evenly over the hours', () => {
    const hourly = evenHourly(24);
    expect(hourly).toHaveLength(HOURS_PER_YEAR);
    expect(hourly.every((value) => value === 1)).toBe(true);
  });
});
