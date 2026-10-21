// ABOUT: Command-line entry point: writes reports/phase-2-v1-model.md from the register and the committed snapshots
// ABOUT: Offline; the report is clock-free and byte-identical between runs. Overdue rows are warned on the console

import { readFileSync, writeFileSync } from 'node:fs';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister, staleRows } from '../src/register/load.ts';
import { loadOctopusSnapshot } from '../src/snapshots/octopusSchema.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { loadPvcalcSnapshot, PVCALC_SNAPSHOT_PATH } from './pvgis/pvcalc.ts';
import { buildReport, REPORT_PATH } from './report/build.ts';

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const register = loadRegister(readJson('data/register.json'));
const access = createAccessor(register);
const report = buildReport({
  register,
  pvgis: loadPvgisSnapshot(readJson(access.series('weather.pvgisTypicalYearLondon').file)),
  octopus: loadOctopusSnapshot(readJson(access.series('tariffs.octopusLondon').file)),
  pvcalc: loadPvcalcSnapshot(readJson(PVCALC_SNAPSHOT_PATH)),
});
writeFileSync(new URL(REPORT_PATH, root), report);
console.log(`Wrote ${REPORT_PATH}`);

// Today's date goes to the console only, never into the report, so the committed report stays byte-identical.
const today = new Date().toISOString().slice(0, 10);
for (const row of staleRows(register, today)) {
  console.warn(`Warning: register row "${row.id}" was due for a fresh check by ${row.dueBy} (last checked ${row.lastChecked})`);
}
