// ABOUT: Checks the paired runs and their summaries: the central run uses defaults, collapsed ranges collapse the band,
// ABOUT: identical setups tie, a better heat pump wins more often, and a higher SPF lowers electricity in every sample

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { band, centralOutsideBand, compare, METRICS, pairedDifference, quantile, runPaired, shareHeatPumpCheaper } from './compare.ts';
import { defaultHouse } from './archetypes.ts';
import { readInputs } from './inputs.ts';
import { simulate } from './simulate.ts';
import { fixtureAccessor, type FixtureRanges } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const rawWeather = weatherFromSnapshot(
  loadPvgisSnapshot(JSON.parse(readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8')) as unknown),
);
const weather = prepareWeather(rawWeather, readInputs(fixtureAccessor()));

const RANGES: FixtureRanges = {
  'fabric.qualityFactor': { low: 0.75, high: 1.15 },
  'gains.perOccupant': { low: 70, high: 130 },
  'heating.meanInternalTemperature': { low: 18, high: 21 },
  'heating.boilerSeasonalEfficiency': { low: 0.75, high: 0.85 },
  'heating.heatPumpSpf': { low: 2, high: 3.5, sigma: 0.15 },
  'hotWater.litresPerOccupant': { low: 12, high: 30 },
  'electricity.baseUse': { low: 2000, high: 3500 },
};
const plan = { seed: 11, count: 40 };

describe('quantile and band', () => {
  it('interpolates linearly between order statistics (type 7)', () => {
    const values = [4, 1, 3, 2, 5];
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 0.5)).toBe(3);
    expect(quantile(values, 1)).toBe(5);
    expect(quantile(values, 0.1)).toBeCloseTo(1.4, 12);
    expect(quantile(values, 0.9)).toBeCloseTo(4.6, 12);
    expect(quantile([7], 0.9)).toBe(7);
  });

  it('rejects an empty list or a quantile outside 0–1', () => {
    expect(() => quantile([], 0.5)).toThrow(/no values/);
    expect(() => quantile([1], 1.1)).toThrow(/between 0 and 1/);
    expect(() => quantile([1], Number.NaN)).toThrow(/between 0 and 1/);
  });

  it('flags a central value outside P10–P90, which skew can cause', () => {
    const values = Array.from({ length: 11 }, (_, index) => index);
    expect(centralOutsideBand(band(values, 5))).toBe(false);
    expect(centralOutsideBand(band(values, 0.5))).toBe(true);
    expect(centralOutsideBand(band(values, 9.5))).toBe(true);
  });
});

describe('the paired difference and share of wins', () => {
  it('gives a difference of zero in every sample and a share of exactly 0.5 for identical setups', () => {
    const costs = Float64Array.from([900, 1_000, 1_100, 1_200]);
    expect([...pairedDifference(costs, costs)]).toEqual([0, 0, 0, 0]);
    expect(shareHeatPumpCheaper(costs, costs)).toBe(0.5);
  });

  it('counts a heat pump win as 1, a tie as half and a loss as 0', () => {
    const gas = Float64Array.from([100, 100, 100, 100]);
    expect(shareHeatPumpCheaper(gas, Float64Array.from([90, 100, 110, 120]))).toBe(1.5 / 4);
  });

  it('rises when the heat pump is made strictly better', () => {
    const gas = Float64Array.from([950, 1_000, 1_050, 1_100, 1_150]);
    const heatPump = Float64Array.from([1_000, 1_000, 1_000, 1_100, 1_100]);
    const better = heatPump.map((cost) => cost - 60);
    expect(shareHeatPumpCheaper(gas, better)).toBeGreaterThan(shareHeatPumpCheaper(gas, heatPump));
  });

  it('rejects arrays of different lengths, or none at all', () => {
    expect(() => pairedDifference(Float64Array.of(1), Float64Array.of(1, 2))).toThrow(/differ in length/);
    expect(() => shareHeatPumpCheaper(new Float64Array(), new Float64Array())).toThrow(/zero samples/);
  });
});

describe('runPaired', () => {
  const access = fixtureAccessor({}, RANGES);
  const run = runPaired(access, weather, plan);

  it('runs the central case with every uncertain row at its default', () => {
    const inputs = readInputs(access);
    expect(run.central.gas.costPounds).toBe(simulate(inputs, weather, 'gas').annual.cost.totalPounds);
    expect(run.central.heatPump.carbonKg).toBe(simulate(inputs, weather, 'heatPump').annual.carbonKg);
  });

  it('keeps one annual total per sample for each metric and setup', () => {
    for (const metric of METRICS) {
      expect(run.samples.gas[metric]).toHaveLength(plan.count);
      expect(run.samples.heatPump[metric]).toHaveLength(plan.count);
    }
  });

  it('gives identical results for the same seed and different results for another seed', () => {
    expect(runPaired(access, weather, plan).samples.heatPump.costPounds).toEqual(run.samples.heatPump.costPounds);
    expect(runPaired(access, weather, { ...plan, seed: 12 }).samples.heatPump.costPounds).not.toEqual(run.samples.heatPump.costPounds);
  });

  it('runs both setups on the same inputs in each sample, so space heat matches sample by sample', () => {
    expect(run.samples.gas.spaceHeatKwh).toEqual(run.samples.heatPump.spaceHeatKwh);
  });

  it('collapses every band to the central value when every range is collapsed', () => {
    const comparison = compare(runPaired(fixtureAccessor(), weather, plan));
    for (const setup of ['gas', 'heatPump'] as const) {
      for (const metric of METRICS) {
        const { central, p10, median, p90 } = comparison.bands[setup][metric];
        expect([p10, median, p90]).toEqual([central, central, central]);
      }
    }
    expect(comparison.costDifference.p10).toBe(comparison.costDifference.central);
  });

  it('lowers heat pump electricity in every sample when the SPF is higher', () => {
    const higherSpf = runPaired(fixtureAccessor({ 'heating.heatPumpSpf': 2.8 }, { ...RANGES, 'heating.heatPumpSpf': { low: 2.3, high: 3.8, sigma: 0.15 } }), weather, plan);
    run.samples.heatPump.electricityKwh.forEach((kwh, sample) => {
      expect(higherSpf.samples.heatPump.electricityKwh[sample]).toBeLessThan(kwh);
    });
  });

  it('raises the share of wins when the heat pump is made strictly better', () => {
    const better = runPaired(fixtureAccessor({ 'heating.heatPumpSpf': 3.2 }, { ...RANGES, 'heating.heatPumpSpf': { low: 2.4, high: 4, sigma: 0.15 } }), weather, plan);
    expect(compare(better).shareHeatPumpCheaper).toBeGreaterThan(compare(run).shareHeatPumpCheaper);
  });

  it('reports the paired cost and carbon differences as gas minus heat pump', () => {
    const comparison = compare(run);
    expect(comparison.costDifference.central).toBeCloseTo(run.central.gas.costPounds - run.central.heatPump.costPounds, 9);
    expect(comparison.carbonDifference.median).toBe(quantile(pairedDifference(run.samples.gas.carbonKg, run.samples.heatPump.carbonKg), 0.5));
  });

  it('applies the house to the central run and every sample', () => {
    const house = { ...defaultHouse(access, 'semi1930s'), loft: 'none' as const };
    const variant = runPaired(access, weather, plan, house);
    expect(variant.house).toEqual(house);
    expect(variant.central.gas.spaceHeatKwh).toBeGreaterThan(run.central.gas.spaceHeatKwh);
    variant.samples.gas.spaceHeatKwh.forEach((kwh, sample) => expect(kwh).toBeGreaterThan(run.samples.gas.spaceHeatKwh[sample]!));
  });
});

describe('the well-installed SPF scenario', () => {
  const ranges: FixtureRanges = { ...RANGES, 'heating.heatPumpSpfWellInstalled': { low: 3, high: 4.5, sigma: 0.1 } };
  const access = fixtureAccessor({}, ranges);
  const fieldTrial = runPaired(access, weather, plan);
  const wellInstalled = runPaired(access, weather, plan, undefined, 'wellInstalled');

  it('shares every draw but the SPF, so the gas setup is identical in both scenarios', () => {
    expect(fieldTrial.spfScenario).toBe('fieldTrial');
    expect(wellInstalled.spfScenario).toBe('wellInstalled');
    for (const metric of METRICS) expect(wellInstalled.samples.gas[metric]).toEqual(fieldTrial.samples.gas[metric]);
    expect(wellInstalled.samples.heatPump.spaceHeatKwh).toEqual(fieldTrial.samples.heatPump.spaceHeatKwh);
  });

  it('runs the heat pump on the well-installed SPF, which is higher here in every sample', () => {
    expect(wellInstalled.central.heatPump.electricityKwh).toBeLessThan(fieldTrial.central.heatPump.electricityKwh);
    wellInstalled.samples.heatPump.electricityKwh.forEach((electricity, sample) => {
      expect(electricity).toBeLessThan(fieldTrial.samples.heatPump.electricityKwh[sample]!);
    });
  });
});
