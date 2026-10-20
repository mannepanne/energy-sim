// ABOUT: Calibrates the register's mean internal temperature to the NEED gas target with the hourly engine
// ABOUT: Solves the temperature at which the gas setup's central annual gas use equals a given amount

import type { RegisterAccessor } from '../../src/register/access.ts';
import { readInputs } from '../../src/engine/inputs.ts';
import { simulate } from '../../src/engine/simulate.ts';
import { prepareWeather, type PreparedWeather, type Weather } from '../../src/engine/weather.ts';

/** The target fixed in the calibration ADR before the engine existed, and its tolerance (NEED readings A–C). */
export const NEED_GAS_TARGET_KWH = 13_200;
export const NEED_GAS_RANGE_KWH = { low: 10_980, high: 15_433 } as const;

const SEARCH_LOW_C = 5;
const SEARCH_HIGH_C = 25;
const BISECTION_STEPS = 50;

/** Central annual gas use (kWh) of the gas setup, with every other row at its default. */
export function centralGasKwh(access: RegisterAccessor, weather: PreparedWeather, meanInternalTemperatureC: number): number {
  const inputs = readInputs(access, { overrides: { 'heating.meanInternalTemperature': meanInternalTemperatureC } });
  return simulate(inputs, weather, 'gas').annual.gasKwh;
}

/** The mean internal temperature at which central annual gas use equals `targetGasKwh`, found by bisection. */
export function solveMeanInternalTemperature(access: RegisterAccessor, weather: PreparedWeather, targetGasKwh: number): number {
  let low = SEARCH_LOW_C;
  let high = SEARCH_HIGH_C;
  if (centralGasKwh(access, weather, low) > targetGasKwh || centralGasKwh(access, weather, high) < targetGasKwh) {
    throw new Error(`No temperature between ${low} and ${high} °C gives ${targetGasKwh} kWh of gas`);
  }
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (centralGasKwh(access, weather, middle) < targetGasKwh) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export interface Calibration {
  default: number;
  low: number;
  high: number;
}

/** The row's default solves the NEED midpoint; its low and high solve NEED readings A and C. */
export function calibrate(access: RegisterAccessor, rawWeather: Weather): Calibration {
  const weather = prepareWeather(rawWeather, readInputs(access));
  return {
    default: solveMeanInternalTemperature(access, weather, NEED_GAS_TARGET_KWH),
    low: solveMeanInternalTemperature(access, weather, NEED_GAS_RANGE_KWH.low),
    high: solveMeanInternalTemperature(access, weather, NEED_GAS_RANGE_KWH.high),
  };
}
