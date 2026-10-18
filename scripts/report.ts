// ABOUT: Command-line entry point: writes reports/phase-1-london-semi.md from the register and the PVGIS snapshot
// ABOUT: Offline and clock-free, so a second run gives byte-identical output (CI checks for drift)

import { readFileSync, writeFileSync } from 'node:fs';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { buildReport, REPORT_PATH } from './report/build.ts';

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const register = loadRegister(readJson('data/register.json'));
const snapshot = loadPvgisSnapshot(readJson(createAccessor(register).series('weather.pvgisTypicalYearLondon').file));
writeFileSync(new URL(REPORT_PATH, root), buildReport(register, snapshot));
console.log(`Wrote ${REPORT_PATH}`);
