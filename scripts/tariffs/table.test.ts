// ABOUT: Tests for the tariff table: one line per combination, what control does on Cosy and Agile, and Agile's
// ABOUT: stated limitations with the months its rates come from. Uses the fixture register and few samples

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readInputs } from '../../src/engine/inputs.ts';
import { readTimeOfUseTariffs } from '../../src/engine/tariffs.ts';
import { fixtureAccessor } from '../../src/engine/testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { loadOctopusSnapshot } from '../../src/snapshots/octopusSchema.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { agileLimitations, COMBINATION_NAMES, controlEffects, tariffTable, TARIFF_PLAN } from './table.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = fixtureAccessor();
const inputs = readInputs(access);
const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json'))), inputs);
const timeOfUse = readTimeOfUseTariffs(access, loadOctopusSnapshot(readJson('../../data/snapshots/octopus-london.json')));

describe('tariffTable', () => {
  const table = tariffTable(access, inputs, weather, timeOfUse, { seed: 1, count: 4 });

  it('has a line for each of the 10 combinations, the reference marked, and ends in one newline', () => {
    for (const name of Object.values(COMBINATION_NAMES)) expect(table).toContain(`| ${name} |`);
    expect(table).toContain('| reference |');
    expect(table.endsWith('.\n')).toBe(true);
    expect(TARIFF_PLAN.count).toBe(200);
  });

  it('shows control off and on for Cosy and Agile, and states Agile’s limitations', () => {
    for (const line of ['Cosy, control off', 'Cosy, control on', 'Agile, control off', 'Agile, control on']) expect(table).toContain(`| ${line} |`);
    for (const limitation of agileLimitations(timeOfUse.agileWindow)) expect(table).toContain(limitation);
  });
});

describe('controlEffects', () => {
  it('moves the heat pump’s electricity into cheap hours on both tariffs', () => {
    const effects = controlEffects(inputs, weather, timeOfUse);
    expect(effects.map((effect) => effect.tariff)).toEqual(['cosy', 'agile']);
    expect(effects.every((effect) => effect.on.cheapShare > effect.off.cheapShare && effect.on.peakShare < effect.off.peakShare)).toBe(true);
  });
});

describe('agileLimitations', () => {
  it('names the first and last month of the window, and states all four limitations', () => {
    const lines = agileLimitations({ start: '2025-10-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' });
    expect(lines[0]).toContain('from October 2025 to September 2026');
    expect(lines.join('\n')).toMatch(/not a forecast[\s\S]*flatters the heat pump[\s\S]*in advance[\s\S]*Weekdays/);
  });
});
