// ABOUT: Checks the one-row-at-a-time sensitivity table: each row at its low and high, others at default,
// ABOUT: ranked by the swing in the cost difference, with ties ordered by row id

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { defaultHouse } from './archetypes.ts';
import { readInputs, UNCERTAIN_ROW_IDS } from './inputs.ts';
import { sensitivity } from './sensitivity.ts';
import { simulate } from './simulate.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const rawWeather = weatherFromSnapshot(
  loadPvgisSnapshot(JSON.parse(readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8')) as unknown),
);
const weather = prepareWeather(rawWeather, readInputs(fixtureAccessor()));

describe('sensitivity', () => {
  const access = fixtureAccessor(
    {},
    {
      'heating.heatPumpSpf': { low: 2, high: 4, sigma: 0.15 },
      'heating.boilerSeasonalEfficiency': { low: 0.75, high: 0.85 },
      'electricity.baseUse': { low: 2000, high: 3500 },
    },
  );
  const table = sensitivity(access, weather);

  it('has one row for every uncertain row', () => {
    expect(table.map((row) => row.id).toSorted()).toEqual(UNCERTAIN_ROW_IDS.toSorted());
  });

  it('runs a house other than the default when given one', () => {
    const house = { ...defaultHouse(access, 'semi1930s'), loft: 'none' as const };
    const noLoft = sensitivity(access, weather, house).find((row) => row.id === 'heating.heatPumpSpf')!;
    const spf = table.find((row) => row.id === 'heating.heatPumpSpf')!;
    expect(noLoft.low.costPounds.gas).toBeGreaterThan(spf.low.costPounds.gas);
  });

  it('runs each row at its low and its high with every other row at its default', () => {
    const spf = table.find((row) => row.id === 'heating.heatPumpSpf')!;
    expect(spf.low.value).toBe(2);
    expect(spf.high.value).toBe(4);
    const atLow = simulate(readInputs(access, { overrides: { 'heating.heatPumpSpf': 2 } }), weather, 'heatPump').annual.cost.totalPounds;
    expect(spf.low.costPounds.heatPump).toBe(atLow);
    expect(spf.low.costPounds.gas).toBe(simulate(readInputs(access), weather, 'gas').annual.cost.totalPounds);
    expect(spf.swingPounds).toBeCloseTo(spf.high.costDifferencePounds - spf.low.costDifferencePounds, 9);
    expect(spf.swingPounds).toBeGreaterThan(0);
  });

  it('ranks by the size of the swing, largest first', () => {
    expect(table.slice(0, 2).map((row) => row.id)).toEqual(['heating.heatPumpSpf', 'heating.boilerSeasonalEfficiency']);
    expect(table[1]!.swingPounds).toBeLessThan(0);
  });

  it('treats a row that cancels out of the difference as a tie, ordered by id', () => {
    const base = table.find((row) => row.id === 'electricity.baseUse')!;
    expect(Math.abs(base.swingPounds)).toBeLessThan(1e-6);
    expect(base.low.costPounds.gas).toBeLessThan(base.high.costPounds.gas);
    const tied = table.slice(2).map((row) => row.id);
    expect(tied).toEqual(tied.toSorted());
  });
});
