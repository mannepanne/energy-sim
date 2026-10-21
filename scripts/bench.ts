// ABOUT: Timing check: the paired sampling (500 samples) of the phase 1 setups, the four setups on the cap and all 10 combinations
// ABOUT: Also times one central run of the 10 against 100 ms and the full phase 2 report against 60 s; exits with an error above any limit

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { COMBINATIONS, onCap, type Combination } from '../src/engine/combinations.ts';
import { runCombinations } from '../src/engine/runCombinations.ts';
import { runSamples } from '../src/engine/compare.ts';
import { readInputs } from '../src/engine/inputs.ts';
import { SETUPS } from '../src/engine/setups.ts';
import { agileFromSnapshot } from '../src/engine/tariffs.ts';
import { prepareWeather, weatherFromSnapshot } from '../src/engine/weather.ts';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadOctopusSnapshot } from '../src/snapshots/octopusSchema.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { loadPvcalcSnapshot } from './pvgis/pvcalc.ts';
import { buildReport, REPORT_PLAN } from './report/build.ts';

/**
 * Limits several times the expected time on the GitHub Actions runner: the phase 1 workload's 5 seconds for two
 * setups, 10 for the four setups on the cap and for all 10 combinations (which share their heat sides), and the
 * spec's 100 ms for one central run of the 10. The full report's limit is the spec's 60 seconds in CI.
 */
const WORKLOADS: readonly { name: string; combinations: readonly Combination[]; limitMs: number }[] = [
  { name: 'gas and heat pump on the cap', combinations: onCap(['gas', 'heatPump']), limitMs: 5_000 },
  { name: 'four setups on the cap', combinations: onCap(SETUPS), limitMs: 10_000 },
  { name: 'all 10 combinations', combinations: COMBINATIONS, limitMs: 10_000 },
];
const CENTRAL_LIMIT_MS = 100;
const REPORT_LIMIT_MS = 60_000;
/** The central run is short, so it is timed as the best of several to keep start-up out of it. */
const CENTRAL_REPEATS = 5;

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const register = loadRegister(readJson('data/register.json'));
const access = createAccessor(register);
const snapshot = loadPvgisSnapshot(readJson(access.series('weather.pvgisTypicalYearLondon').file));
const octopus = loadOctopusSnapshot(readJson(access.series('tariffs.octopusLondon').file));
const agile = agileFromSnapshot(octopus);
const inputs = readInputs(access);
const weather = prepareWeather(weatherFromSnapshot(snapshot), inputs);

let failed = false;
const check = (label: string, elapsedMs: number, limitMs: number): void => {
  console.log(`${label} took ${elapsedMs.toFixed(elapsedMs < 1000 ? 1 : 0)} ms (limit ${limitMs} ms)`);
  if (elapsedMs > limitMs) failed = true;
};

let centralMs = Number.POSITIVE_INFINITY;
for (let repeat = 0; repeat < CENTRAL_REPEATS; repeat += 1) {
  const start = performance.now();
  runCombinations(inputs, weather, COMBINATIONS, agile);
  centralMs = Math.min(centralMs, performance.now() - start);
}
check('One central run of all 10 combinations', centralMs, CENTRAL_LIMIT_MS);

for (const { name, combinations, limitMs } of WORKLOADS) {
  const start = performance.now();
  runSamples(access, weather, REPORT_PLAN, { combinations, agile });
  check(`${REPORT_PLAN.count} samples × ${name}`, performance.now() - start, limitMs);
}
const reportStart = performance.now();
buildReport({ register, pvgis: snapshot, octopus, pvcalc: loadPvcalcSnapshot(readJson('data/snapshots/pvgis-pvcalc-london.json')) });
check('The full phase 2 report', performance.now() - reportStart, REPORT_LIMIT_MS);

if (failed) {
  console.error('Bench failed: a run is slower than its limit');
  process.exit(1);
}
