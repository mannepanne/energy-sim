// ABOUT: Checks that the register's heating setpoint still hits the NEED gas target with the hourly engine and schedule
// ABOUT: Fails if a geometry, fabric, mass, schedule, gains, boiler, hot water or weather row drifts away from the calibration

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { readInputs } from '../../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { calibrate, centralGasKwh, NEED_GAS_RANGE_KWH, NEED_GAS_TARGET_KWH, PLAUSIBLE_SETPOINT_C, solveSetpoint } from './setpoint.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = createAccessor(loadRegister(readJson('../../data/register.json')));
const weather = weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')));
const prepared = prepareWeather(weather, readInputs(access));
const row = access.uncertain('heating.setpoint');

describe('setpoint calibration (hourly engine with thermal mass and SAP’s schedule, PVGIS year)', () => {
  const solved = calibrate(access, weather);

  it('matches the setpoint solved for the 13,200 kWh target, to 0.1 °C', () => {
    expect(Math.abs(solved.default - row.default)).toBeLessThan(0.1);
  });

  it('gives central gas use near the target and inside the NEED range', () => {
    const gas = centralGasKwh(access, prepared, row.default);
    expect(Math.abs(gas - NEED_GAS_TARGET_KWH)).toBeLessThan(150);
    expect(gas).toBeGreaterThanOrEqual(NEED_GAS_RANGE_KWH.low);
    expect(gas).toBeLessThanOrEqual(NEED_GAS_RANGE_KWH.high);
  });

  it('sets low and high at the setpoints reproducing NEED readings A and C, to 0.1 °C', () => {
    expect(Math.abs(solved.low - row.low)).toBeLessThan(0.1);
    expect(Math.abs(solved.high - row.high)).toBeLessThan(0.1);
  });

  it('solves every setpoint inside the spec’s plausible 16–21 °C', () => {
    for (const setpoint of [solved.low, solved.default, solved.high]) {
      expect(setpoint).toBeGreaterThanOrEqual(PLAUSIBLE_SETPOINT_C.low);
      expect(setpoint).toBeLessThanOrEqual(PLAUSIBLE_SETPOINT_C.high);
    }
  });

  it('throws when no setpoint in range reaches the target', () => {
    expect(() => solveSetpoint(access, prepared, 1)).toThrow('No setpoint between 5 and 30 °C');
    expect(() => solveSetpoint(access, prepared, 1_000_000)).toThrow('No setpoint');
  });
});
