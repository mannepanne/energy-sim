// ABOUT: Command-line entry point: prints the tariff table (the 10 setup and tariff combinations, and what control does)
// ABOUT: Offline; reads data/register.json, the PVGIS snapshot and the Octopus snapshot

import { readFileSync } from 'node:fs';
import { readInputs } from '../src/engine/inputs.ts';
import { agileFromSnapshot } from '../src/engine/tariffs.ts';
import { prepareWeather, weatherFromSnapshot } from '../src/engine/weather.ts';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadOctopusSnapshot } from '../src/snapshots/octopusSchema.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { tariffTable } from './tariffs/table.ts';

const root = new URL('../', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

const access = createAccessor(loadRegister(readJson('data/register.json')));
const snapshot = loadPvgisSnapshot(readJson(access.series('weather.pvgisTypicalYearLondon').file));
const agile = agileFromSnapshot(loadOctopusSnapshot(readJson(access.series('tariffs.octopusLondon').file)));
const inputs = readInputs(access);
const weather = prepareWeather(weatherFromSnapshot(snapshot), inputs);
process.stdout.write(tariffTable(access, inputs, weather, agile));
