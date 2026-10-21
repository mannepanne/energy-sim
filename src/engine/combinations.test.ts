// ABOUT: Checks the tariff grid: the 10 combinations, the tariffs each setup may use, the runner that shares heat
// ABOUT: sides, and that every row a combination is said not to read leaves its running cost unchanged

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadOctopusSnapshot } from '../snapshots/octopusSchema.ts';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import {
  COMBINATIONS,
  combinationOf,
  combinationReads,
  forCombination,
  onCap,
  partsOf,
  REFERENCE_COMBINATION,
  TARIFFS_FOR,
} from './combinations.ts';
import { readInputs, uncertainDraws, UNCERTAIN_ROW_IDS, type UncertainRowId } from './inputs.ts';
import { SETUP_KIT, SETUPS } from './setups.ts';
import { simulate } from './simulate.ts';
import { checkAgileGiven, runCombinations, tariffFor } from './runCombinations.ts';
import { agileFromSnapshot } from './tariffs.ts';
import { fixtureAccessor, type FixtureRanges } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const rawWeather = weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')));
const weather = prepareWeather(rawWeather, readInputs(fixtureAccessor()));
const octopus = loadOctopusSnapshot(readJson('../../data/snapshots/octopus-london.json'));

describe('the combinations', () => {
  it('are each setup on each tariff it can use: 10, with no gas setup on Cosy', () => {
    expect(COMBINATIONS).toEqual(SETUPS.flatMap((setup) => TARIFFS_FOR[SETUP_KIT[setup].heating].map((tariff) => `${setup}/${tariff}`)));
    expect(COMBINATIONS).toHaveLength(10);
    expect(REFERENCE_COMBINATION).toBe('gas/cap');
    expect(() => combinationOf('gasSolar', 'cosy')).toThrow(/cannot be on the cosy tariff/);
  });

  it('split into their setup and tariff, and name each setup on the cap', () => {
    for (const combination of COMBINATIONS) {
      const { setup, tariff } = partsOf(combination);
      expect(combinationOf(setup, tariff)).toBe(combination);
    }
    expect(onCap(['gas', 'heatPumpSolar'])).toEqual(['gas/cap', 'heatPumpSolar/cap']);
  });

  it('throws, naming the combination, for one a record leaves out', () => {
    expect(forCombination({ 'gas/cap': 1 }, 'gas/cap')).toBe(1);
    expect(() => forCombination({ 'gas/cap': 1 }, 'heatPump/cosy')).toThrow(/"heatPump\/cosy" is not in this run/);
  });

  it('need Agile’s rates from the snapshot for Agile only, and say so before any run', () => {
    const inputs = readInputs(fixtureAccessor());
    expect(tariffFor('cap', inputs, undefined).tariff).toBe('cap');
    expect(tariffFor('cosy', inputs, undefined).tariff).toBe('cosy');
    expect(() => tariffFor('agile', inputs, undefined)).toThrow(/needs Agile’s rates|needs Agile's rates/);
    expect(() => checkAgileGiven(['gas/cap', 'heatPump/cosy'], undefined)).not.toThrow();
    expect(() => checkAgileGiven(['gas/agile'], undefined)).toThrow(/needs Agile's rates/);
  });
});

describe('runCombinations', () => {
  const access = fixtureAccessor();
  const agile = agileFromSnapshot(octopus);
  const inputs = readInputs(access);
  const results = runCombinations(inputs, weather, COMBINATIONS, agile);

  it('gives each combination what a run of it alone gives', () => {
    const alone = Object.fromEntries(
      COMBINATIONS.map((combination) => {
        const { setup, tariff } = partsOf(combination);
        const { heating, solar } = SETUP_KIT[setup];
        return [combination, simulate(inputs, weather, heating, { solar, tariff: tariffFor(tariff, inputs, agile) }).annual];
      }),
    );
    expect(results).toEqual(alone);
  });

  it('shares the heat side: gas on Agile burns the same gas as on the cap, and solar leaves heat unchanged', () => {
    expect(forCombination(results, 'gas/agile').gasKwh).toBe(forCombination(results, 'gas/cap').gasKwh);
    expect(forCombination(results, 'heatPumpSolar/cosy').spaceHeatKwh).toBe(forCombination(results, 'heatPump/cosy').spaceHeatKwh);
  });
});

/** A range of ±20% around every uncertain fixture value, or ±0.02 around zero, so every row moves. */
const EVERY_RANGE: FixtureRanges = Object.fromEntries(
  UNCERTAIN_ROW_IDS.map((id: UncertainRowId) => {
    const value = fixtureAccessor().uncertain(id).default;
    const spread = value === 0 ? 0.02 : Math.abs(value) * 0.2;
    if (id === 'solar.usableRoofFraction') return [id, { low: 0.5, high: 1 }];
    return [id, { low: value - spread, high: value + spread }];
  }),
);

describe('combinationReads', () => {
  const access = fixtureAccessor({}, EVERY_RANGE);
  const agile = agileFromSnapshot(octopus);
  it('is false only for rows that leave the combination’s running cost unchanged between their low and high', () => {
    let excludedCount = 0;
    for (const draw of uncertainDraws(access)) {
      // Only the combinations said not to read the row run, since its range may not suit the others (a negative standby share).
      const excluded = COMBINATIONS.filter((combination) => !combinationReads(combination, draw.id));
      if (excluded.length === 0) continue;
      const costsAt = (value: number) => runCombinations(readInputs(access, { overrides: { [draw.id]: value } }), weather, excluded, agile);
      const [low, high] = [costsAt(draw.low), costsAt(draw.high)];
      for (const combination of excluded) {
        excludedCount += 1;
        const cost = (results: typeof low): number => forCombination(results, combination).cost.totalPounds;
        expect(cost(low), `${draw.id} on ${combination}`).toBeCloseTo(cost(high), 9);
      }
    }
    expect(excludedCount).toBeGreaterThan(0);
  });

  it('lists the control boost only for a heat pump on Cosy or Agile', () => {
    expect(COMBINATIONS.filter((combination) => combinationReads(combination, 'heating.controlBoost'))).toEqual([
      'heatPump/cosy',
      'heatPump/agile',
      'heatPumpSolar/cosy',
      'heatPumpSolar/agile',
    ]);
  });
});
