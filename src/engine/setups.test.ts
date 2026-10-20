// ABOUT: Checks the four setups' names and kit, and that every row a setup is said not to read leaves its running cost
// ABOUT: unchanged, so the sensitivity tables never drop a row that matters

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { readInputs, uncertainDraws, UNCERTAIN_ROW_IDS, type UncertainRowId } from './inputs.ts';
import { forSetup, runningCostReads, SETUP_KIT, setupOf, SETUPS } from './setups.ts';
import { simulate } from './simulate.ts';
import { fixtureAccessor, type FixtureRanges } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const rawWeather = weatherFromSnapshot(
  loadPvgisSnapshot(JSON.parse(readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8')) as unknown),
);
const weather = prepareWeather(rawWeather, readInputs(fixtureAccessor()));

/** A range of ±20% around every uncertain fixture value, or ±0.02 around zero, so every row moves. */
const EVERY_RANGE: FixtureRanges = Object.fromEntries(
  UNCERTAIN_ROW_IDS.map((id: UncertainRowId) => {
    const value = fixtureAccessor().uncertain(id).default;
    const spread = value === 0 ? 0.02 : Math.abs(value) * 0.2;
    // The usable roof share must stay at or below 1.
    if (id === 'solar.usableRoofFraction') return [id, { low: 0.5, high: 1 }];
    return [id, { low: value - spread, high: value + spread }];
  }),
);

describe('the setups', () => {
  it('names each combination of heating and solar once', () => {
    for (const setup of SETUPS) expect(setupOf(SETUP_KIT[setup].heating, SETUP_KIT[setup].solar)).toBe(setup);
  });

  it('throws, naming the setup, for one a record leaves out', () => {
    expect(forSetup({ gas: 1 }, 'gas')).toBe(1);
    expect(() => forSetup({ gas: 1 }, 'heatPump')).toThrow(/"heatPump" is not in this run/);
  });
});

describe('runningCostReads', () => {
  const access = fixtureAccessor({}, EVERY_RANGE);
  const costAt = (setup: (typeof SETUPS)[number], id: string, value: number): number => {
    const { heating, solar } = SETUP_KIT[setup];
    return simulate(readInputs(access, { overrides: { [id]: value } }), weather, heating, { solar }).annual.cost.totalPounds;
  };

  it('is false only for rows that leave the setup’s running cost unchanged between their low and high', () => {
    let excluded = 0;
    for (const draw of uncertainDraws(access)) {
      for (const setup of SETUPS) {
        if (runningCostReads(setup, draw.id)) continue;
        excluded += 1;
        expect(costAt(setup, draw.id, draw.low), `${draw.id} on ${setup}`).toBeCloseTo(costAt(setup, draw.id, draw.high), 9);
      }
    }
    expect(excluded).toBeGreaterThan(0);
  });

  it('is true for a row that moves only the setups said to read it', () => {
    expect(SETUPS.filter((setup) => runningCostReads(setup, 'heating.heatPumpSpf'))).toEqual(['heatPump', 'heatPumpSolar']);
    expect(SETUPS.filter((setup) => runningCostReads(setup, 'heating.boilerSeasonalEfficiency'))).toEqual(['gas', 'gasSolar']);
    expect(SETUPS.filter((setup) => runningCostReads(setup, 'solar.azimuth'))).toEqual(['gasSolar', 'heatPumpSolar']);
    expect(SETUPS.filter((setup) => runningCostReads(setup, 'costs.heatPumpInstalled'))).toEqual([]);
    expect(SETUPS.filter((setup) => runningCostReads(setup, 'fabric.qualityFactor'))).toEqual(SETUPS);
  });
});
