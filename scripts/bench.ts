// ABOUT: Timing check: runs the paired sampling (500 samples × 2 setups) on the real register and logs the time
// ABOUT: Exits with an error above 5 seconds, many times the expected time, so it catches a real slowdown

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

const start = performance.now();
const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access));
runPaired(access, weather, REPORT_PLAN);
const elapsedMs = performance.now() - start;

console.log(`${REPORT_PLAN.count} samples × 2 setups took ${Math.round(elapsedMs)} ms (limit ${LIMIT_MS} ms)`);
if (elapsedMs > LIMIT_MS) {
  console.error('Bench failed: the paired run is slower than the limit');
  process.exit(1);
}
