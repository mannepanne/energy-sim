// ABOUT: Command-line entry point: prints the calibrated heating setpoint for the register
// ABOUT: Reads data/register.json and the PVGIS snapshot; copy the printed values into the row by hand

import { readFileSync } from 'node:fs';
import { createAccessor } from '../src/register/access.ts';
import { loadRegister } from '../src/register/load.ts';
import { loadPvgisSnapshot } from '../src/snapshots/pvgisSchema.ts';
import { readInputs } from '../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../src/engine/weather.ts';
import { calibrate, centralGasKwh, NEED_GAS_TARGET_KWH } from './calibration/setpoint.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;

const access = createAccessor(loadRegister(readJson('../data/register.json')));
const weather = weatherFromSnapshot(loadPvgisSnapshot(readJson(`../${access.series('weather.pvgisTypicalYearLondon').file}`)));
const solved = calibrate(access, weather);
const row = access.uncertain('heating.setpoint');

console.log(`Solved for ${NEED_GAS_TARGET_KWH} kWh of gas: default ${solved.default.toFixed(2)} °C, low ${solved.low.toFixed(2)} °C, high ${solved.high.toFixed(2)} °C`);
console.log(`Register row: default ${row.default} °C, low ${row.low} °C, high ${row.high} °C`);
const prepared = prepareWeather(weather, readInputs(access));
console.log(`Central gas use at the register default: ${Math.round(centralGasKwh(access, prepared, row.default))} kWh`);
