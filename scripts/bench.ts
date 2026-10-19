// ABOUT: Timing check: runs the paired sampling (500 samples × 2 setups), without and with solar, and logs the times
// ABOUT: Exits with an error if either run takes above 5 seconds, many times the expected time, so it catches a real slowdown

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runPaired } from '../src/engine/compare.ts';
import { readInputs } from '../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../src/engine/weather.ts';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { REPORT_PLAN } from './report/build.ts';

const LIMIT_MS = 5_000;

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const access = createAccessor(loadRegister(readJson('data/register.json')));
const snapshot = loadPvgisSnapshot(readJson(access.series('weather.pvgisTypicalYearLondon').file));

const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access));

let failed = false;
for (const solar of [false, true]) {
  const start = performance.now();
  runPaired(access, weather, REPORT_PLAN, undefined, 'fieldTrial', { solar });
  const elapsedMs = performance.now() - start;
  console.log(`${REPORT_PLAN.count} samples × 2 setups ${solar ? 'with' : 'without'} solar took ${Math.round(elapsedMs)} ms (limit ${LIMIT_MS} ms)`);
  if (elapsedMs > LIMIT_MS) failed = true;
}
if (failed) {
  console.error('Bench failed: a paired run is slower than the limit');
  process.exit(1);
}
