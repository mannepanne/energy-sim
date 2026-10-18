// ABOUT: Checks that the register's mean internal temperature still hits the NEED gas target with the hourly engine
// ABOUT: Fails if a geometry, fabric, gains, boiler, hot water or weather row drifts away from the calibration

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { weatherFromSnapshot } from '../../src/engine/weather.ts';
import { calibrate, centralGasKwh, NEED_GAS_RANGE_KWH, NEED_GAS_TARGET_KWH, solveMeanInternalTemperature } from './meanInternalTemperature.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = createAccessor(loadRegister(readJson('../../data/register.json')));
const weather = weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')));
const row = access.uncertain('heating.meanInternalTemperature');

describe('mean internal temperature calibration (hourly engine, PVGIS year)', () => {
  const solved = calibrate(access, weather);

  it('matches the temperature solved for the 13,200 kWh target, to 0.1 °C', () => {
    expect(Math.abs(solved.default - row.default)).toBeLessThan(0.1);
  });

  it('gives central gas use near the target and inside the NEED range', () => {
    const gas = centralGasKwh(access, weather, row.default);
    expect(Math.abs(gas - NEED_GAS_TARGET_KWH)).toBeLessThan(150);
    expect(gas).toBeGreaterThanOrEqual(NEED_GAS_RANGE_KWH.low);
    expect(gas).toBeLessThanOrEqual(NEED_GAS_RANGE_KWH.high);
  });

  it('sets low and high at the temperatures reproducing NEED readings A and C, to 0.1 °C', () => {
    expect(Math.abs(solved.low - row.low)).toBeLessThan(0.1);
    expect(Math.abs(solved.high - row.high)).toBeLessThan(0.1);
  });

  it('throws when no temperature in range reaches the target', () => {
    expect(() => solveMeanInternalTemperature(access, weather, 1)).toThrow('No temperature between 5 and 25 °C');
    expect(() => solveMeanInternalTemperature(access, weather, 1_000_000)).toThrow('No temperature');
  });
});
