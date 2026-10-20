// ABOUT: Timing check: runs the paired sampling (500 samples) of the two setups without solar, then all four, and logs the times
// ABOUT: Exits with an error above 2.5 seconds per setup (5 for two, 10 for four), several times the expected time

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runSetups } from '../src/engine/compare.ts';
import { SETUPS, type Setup } from '../src/engine/setups.ts';
import { readInputs } from '../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../src/engine/weather.ts';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { REPORT_PLAN } from './report/build.ts';

/** The phase 1 workload's limit of 5 seconds for two setups, as a rate per setup, so four setups get 10 seconds. */
const LIMIT_MS_PER_SETUP = 2_500;

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const access = createAccessor(loadRegister(readJson('data/register.json')));
const snapshot = loadPvgisSnapshot(readJson(access.series('weather.pvgisTypicalYearLondon').file));

const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access));

let failed = false;
const WORKLOADS: readonly (readonly Setup[])[] = [['gas', 'heatPump'], SETUPS];
for (const setups of WORKLOADS) {
  const start = performance.now();
  runSetups(access, weather, REPORT_PLAN, { setups });
  const elapsedMs = performance.now() - start;
  const limitMs = LIMIT_MS_PER_SETUP * setups.length;
  console.log(`${REPORT_PLAN.count} samples × ${setups.join(', ')} took ${Math.round(elapsedMs)} ms (limit ${limitMs} ms)`);
  if (elapsedMs > limitMs) failed = true;
}
if (failed) {
  console.error('Bench failed: a paired run is slower than the limit');
  process.exit(1);
}
