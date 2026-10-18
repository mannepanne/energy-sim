// ABOUT: Command-line entry point: writes reports/phase-1-london-semi.md from the register and the PVGIS snapshot
// ABOUT: Offline; the report is clock-free and byte-identical between runs. Overdue rows are warned on the console

import { readFileSync, writeFileSync } from 'node:fs';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister, staleRows } from '../src/register/load.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { buildReport, REPORT_PATH } from './report/build.ts';

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const register = loadRegister(readJson('data/register.json'));
const snapshot = loadPvgisSnapshot(readJson(createAccessor(register).series('weather.pvgisTypicalYearLondon').file));
writeFileSync(new URL(REPORT_PATH, root), buildReport(register, snapshot));
console.log(`Wrote ${REPORT_PATH}`);

// Today's date goes to the console only, never into the report, so the committed report stays byte-identical.
const today = new Date().toISOString().slice(0, 10);
for (const row of staleRows(register, today)) {
  console.warn(`Warning: register row "${row.id}" was due for a fresh check by ${row.dueBy} (last checked ${row.lastChecked})`);
}
