// ABOUT: Runs the engine's central values for the four setups on the price cap, from the register and weather data
// ABOUT: Pure and framework-free, so the web worker and the tests call the same code

import { onCap } from '../../src/engine/combinations.ts';
import { readInputs } from '../../src/engine/inputs.ts';
import { runCombinations } from '../../src/engine/runCombinations.ts';
import { SETUPS, type Setup } from '../../src/engine/setups.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { createAccessor } from '../../src/register/access.ts';
import type { Register } from '../../src/register/schema.ts';
import type { PvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';

export interface CentralData {
  /** The register, already validated when it was built. The browser never loads Zod. */
  register: Register;
  weather: PvgisSnapshot;
}

export interface CentralRow {
  setup: Setup;
  totalPounds: number;
  carbonKg: number;
}

/** The reference house's central running cost and carbon for each setup on the price cap. */
export function centralOnCap(data: CentralData): CentralRow[] {
  const access = createAccessor(data.register);
  const inputs = readInputs(access);
  const weather = prepareWeather(weatherFromSnapshot(data.weather), inputs);
  const results = runCombinations(inputs, weather, onCap(SETUPS));
  return SETUPS.map((setup) => {
    const annual = results[`${setup}/cap`];
    if (!annual) throw new Error(`No result for ${setup} on the price cap`);
    return { setup, totalPounds: annual.cost.totalPounds, carbonKg: annual.carbonKg };
  });
}
