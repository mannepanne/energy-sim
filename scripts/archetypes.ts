// ABOUT: Command-line entry point: prints the archetype table (gas use and costs against the NEED readings)
// ABOUT: Offline; reads data/register.json and the PVGIS snapshot

import { readFileSync } from 'node:fs';
import { readInputs } from '../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../src/engine/weather.ts';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { archetypeRows, archetypeTable } from './archetypes/table.ts';

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const access = createAccessor(loadRegister(readJson('data/register.json')));
const snapshot = loadPvgisSnapshot(readJson(access.series('weather.pvgisTypicalYearLondon').file));
const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access));
process.stdout.write(archetypeTable(archetypeRows(access, weather)));
