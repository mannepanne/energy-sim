// ABOUT: Timing check: runs the paired sampling (500 samples) of the two setups without solar, then all four, and logs the times
// ABOUT: Exits with an error if either run takes above 5 seconds, many times the expected time, so it catches a real slowdown

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

const LIMIT_MS = 5_000;

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
  console.log(`${REPORT_PLAN.count} samples × ${setups.join(', ')} took ${Math.round(elapsedMs)} ms (limit ${LIMIT_MS} ms)`);
  if (elapsedMs > LIMIT_MS) failed = true;
}
if (failed) {
  console.error('Bench failed: a paired run is slower than the limit');
  process.exit(1);
}
