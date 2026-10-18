// ABOUT: Checks that the register's provisional mean internal temperature still hits the NEED gas target
// ABOUT: Fails if a geometry, fabric, internal gains, boiler or hot water row drifts away from the calibration

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { NEED_GAS_RANGE_KWH, NEED_GAS_TARGET_KWH, roughAnnualGasKwh, solveMeanInternalTemperature } from './calibration.ts';

const register = loadRegister(JSON.parse(readFileSync(new URL('../../data/register.json', import.meta.url), 'utf8')) as unknown);
const access = createAccessor(register);
const row = access.uncertain('heating.meanInternalTemperature');

describe('provisional mean internal temperature calibration', () => {
  it('matches the temperature solved for the 13,200 kWh target, to 0.1 °C', () => {
    expect(Math.abs(solveMeanInternalTemperature(access, NEED_GAS_TARGET_KWH) - row.default)).toBeLessThan(0.1);
  });

  it('gives central gas use near the target and inside the NEED range', () => {
    const gas = roughAnnualGasKwh(access, row.default);
    expect(Math.abs(gas - NEED_GAS_TARGET_KWH)).toBeLessThan(150);
    expect(gas).toBeGreaterThanOrEqual(NEED_GAS_RANGE_KWH.low);
    expect(gas).toBeLessThanOrEqual(NEED_GAS_RANGE_KWH.high);
  });

  it('sets low and high at the temperatures reproducing NEED readings A and C, to 0.1 °C', () => {
    expect(Math.abs(solveMeanInternalTemperature(access, NEED_GAS_RANGE_KWH.low) - row.low)).toBeLessThan(0.1);
    expect(Math.abs(solveMeanInternalTemperature(access, NEED_GAS_RANGE_KWH.high) - row.high)).toBeLessThan(0.1);
  });

  it('throws when no temperature in range reaches the target', () => {
    expect(() => solveMeanInternalTemperature(access, 1)).toThrow('No temperature between 5 and 25 °C');
    expect(() => solveMeanInternalTemperature(access, 1_000_000)).toThrow('No temperature');
  });
});
