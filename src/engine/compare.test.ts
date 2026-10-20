// ABOUT: Checks the paired runs of N setups and their summaries: the central run uses defaults, collapsed ranges collapse
// ABOUT: the band, ties split the share cheapest, setups pair sample by sample, and payback follows each sample's economics

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { band, centralOutsideBand, compare, METRICS, pairedDifference, quantile, runSetups, shareCheapest } from './compare.ts';
import { components, DOES_NOT_PAY_BACK, paybackQuantile, samplePayback, solarHorizon, upfrontPounds } from './payback.ts';
import { forSetup, SETUPS } from './setups.ts';
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
  'heating.setpoint': { low: 18, high: 21 },
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

describe('the paired difference and the share cheapest', () => {
  it('gives a difference of zero in every sample and equal shares for identical options', () => {
    const costs = Float64Array.from([900, 1_000, 1_100, 1_200]);
    expect([...pairedDifference(costs, costs)]).toEqual([0, 0, 0, 0]);
    expect(shareCheapest([costs, costs])).toEqual([0.5, 0.5]);
    expect(shareCheapest([costs, costs, costs]).map((value) => value * 3)).toEqual([1, 1, 1]);
  });

  it('counts a win as 1 and splits a tie equally between the options tied for least', () => {
    const gas = Float64Array.from([100, 100, 100, 100]);
    const heatPump = Float64Array.from([90, 100, 110, 120]);
    expect(shareCheapest([gas, heatPump])).toEqual([2.5 / 4, 1.5 / 4]);
    const third = Float64Array.from([95, 100, 200, 200]);
    // Sample 1 ties three ways; the others have one cheapest.
    const expected = [(1 / 3 + 2) / 4, (1 + 1 / 3) / 4, 1 / 3 / 4];
    shareCheapest([gas, heatPump, third]).forEach((value, option) => expect(value).toBeCloseTo(expected[option]!, 12));
  });

  it('rises for an option made strictly better', () => {
    const gas = Float64Array.from([950, 1_000, 1_050, 1_100, 1_150]);
    const heatPump = Float64Array.from([1_000, 1_000, 1_000, 1_100, 1_100]);
    const better = heatPump.map((cost) => cost - 60);
    expect(shareCheapest([gas, better])[1]).toBeGreaterThan(shareCheapest([gas, heatPump])[1]!);
  });

  it('rejects arrays of different lengths, no options, or no samples', () => {
    expect(() => pairedDifference(Float64Array.of(1), Float64Array.of(1, 2))).toThrow(/differ in length/);
    expect(() => shareCheapest([Float64Array.of(1), Float64Array.of(1, 2)])).toThrow(/differ in length/);
    expect(() => shareCheapest([])).toThrow(/no options/);
    expect(() => shareCheapest([new Float64Array(), new Float64Array()])).toThrow(/zero samples/);
  });
});

describe('runSetups', () => {
  const access = fixtureAccessor({}, RANGES);
  const run = runSetups(access, weather, plan);
  const samples = (setup: (typeof SETUPS)[number]) => forSetup(run.samples, setup);

  it('runs all four setups by default, and the central case with every uncertain row at its default', () => {
    expect(run.setups).toEqual(SETUPS);
    const inputs = readInputs(access);
    expect(forSetup(run.central, 'gas').costPounds).toBe(simulate(inputs, weather, 'gas').annual.cost.totalPounds);
    expect(forSetup(run.central, 'heatPump').carbonKg).toBe(simulate(inputs, weather, 'heatPump').annual.carbonKg);
    expect(forSetup(run.central, 'heatPumpSolar').costPounds).toBe(simulate(inputs, weather, 'heatPump', { solar: true }).annual.cost.totalPounds);
  });

  it('keeps one annual total per sample for each metric and setup, and one set of economics per sample', () => {
    for (const setup of SETUPS) for (const metric of METRICS) expect(samples(setup)[metric]).toHaveLength(plan.count);
    expect(run.economics).toHaveLength(plan.count);
  });

  it('splits the running cost into a gas part and an electricity part net of export', () => {
    for (const setup of SETUPS) {
      const totals = forSetup(run.central, setup);
      expect(totals.gasCostPounds + totals.electricityCostPounds).toBeCloseTo(totals.costPounds, 9);
    }
    expect(forSetup(run.central, 'heatPump').gasCostPounds).toBe(0);
  });

  it('gives identical results for the same seed and different results for another seed', () => {
    expect(forSetup(runSetups(access, weather, plan).samples, 'heatPump').costPounds).toEqual(samples('heatPump').costPounds);
    expect(forSetup(runSetups(access, weather, { ...plan, seed: 12 }).samples, 'heatPump').costPounds).not.toEqual(samples('heatPump').costPounds);
  });

  it('pairs a run of some setups with a run of all four, sample by sample', () => {
    const two = runSetups(access, weather, plan, { setups: ['gas', 'heatPump'] });
    expect(two.central.gasSolar).toBeUndefined();
    expect(forSetup(two.samples, 'heatPump').costPounds).toEqual(samples('heatPump').costPounds);
    expect(two.economics).toEqual(run.economics);
    expect(() => forSetup(two.samples, 'gasSolar')).toThrow(/"gasSolar" is not in this run/);
  });

  it('rejects an empty or repeated list of setups', () => {
    expect(() => runSetups(access, weather, plan, { setups: [] })).toThrow(/distinct and at least one/);
    expect(() => runSetups(access, weather, plan, { setups: ['gas', 'gas'] })).toThrow(/distinct and at least one/);
  });

  it('gives the solar setups one roof, and lowers imports and cost in every sample', () => {
    expect(samples('gas').generationKwh.every((value) => value === 0)).toBe(true);
    expect(samples('gasSolar').generationKwh).toEqual(samples('heatPumpSolar').generationKwh);
    expect(samples('gasSolar').spaceHeatKwh).toEqual(samples('gas').spaceHeatKwh);
    samples('heatPumpSolar').importKwh.forEach((imported, sample) => {
      expect(imported).toBeLessThan(samples('heatPump').importKwh[sample]!);
      expect(samples('heatPumpSolar').costPounds[sample]!).toBeLessThan(samples('heatPump').costPounds[sample]!);
    });
  });

  it('runs every setup on the same inputs in each sample, so space heat matches sample by sample', () => {
    for (const setup of SETUPS) expect(samples(setup).spaceHeatKwh).toEqual(samples('gas').spaceHeatKwh);
  });

  it('keeps each setup’s upfront cost after the grant', () => {
    const { capital, pvPeakPowerKw } = run.centralEconomics;
    expect(forSetup(run.central, 'gas').upfrontPounds).toBe(2_000);
    expect(forSetup(run.central, 'heatPump').upfrontPounds).toBe(12_000 - 7_500);
    expect(forSetup(run.central, 'heatPumpSolar').upfrontPounds).toBe(12_000 - 7_500 + pvPeakPowerKw * capital.pvPoundsPerKwp);
    expect(pvPeakPowerKw).toBe(4);
  });

  it('applies the house to the central run and every sample', () => {
    const house = { ...defaultHouse(access, 'semi1930s'), loft: 'none' as const };
    const variant = runSetups(access, weather, plan, { house, setups: ['gas'] });
    expect(variant.house).toEqual(house);
    expect(forSetup(variant.central, 'gas').spaceHeatKwh).toBeGreaterThan(forSetup(run.central, 'gas').spaceHeatKwh);
    forSetup(variant.samples, 'gas').spaceHeatKwh.forEach((kwh, sample) => expect(kwh).toBeGreaterThan(samples('gas').spaceHeatKwh[sample]!));
  });

  it('lowers heat pump electricity in every sample when the SPF is higher', () => {
    const higher = runSetups(fixtureAccessor({ 'heating.heatPumpSpf': 2.8 }, { ...RANGES, 'heating.heatPumpSpf': { low: 2.3, high: 3.8, sigma: 0.15 } }), weather, plan, {
      setups: ['heatPump'],
    });
    samples('heatPump').electricityKwh.forEach((kwh, sample) => expect(forSetup(higher.samples, 'heatPump').electricityKwh[sample]).toBeLessThan(kwh));
  });
});

describe('compare', () => {
  const access = fixtureAccessor({}, RANGES);
  const run = runSetups(access, weather, plan);
  const comparison = compare(run);

  it('collapses every band to the central value when every range is collapsed', () => {
    const collapsed = compare(runSetups(fixtureAccessor(), weather, plan));
    for (const setup of SETUPS) {
      for (const metric of METRICS) {
        const { central, p10, median, p90 } = forSetup(collapsed.bands, setup)[metric];
        expect([p10, median, p90]).toEqual([central, central, central]);
      }
    }
    const difference = forSetup(collapsed.differences, 'heatPump').costPounds;
    expect(difference.p10).toBe(difference.central);
  });

  it('reports paired differences as reference minus setup, for every setup but the reference', () => {
    expect(comparison.reference).toBe('gas');
    expect(comparison.differences.gas).toBeUndefined();
    const heatPump = forSetup(comparison.differences, 'heatPump');
    expect(heatPump.costPounds.central).toBeCloseTo(forSetup(run.central, 'gas').costPounds - forSetup(run.central, 'heatPump').costPounds, 9);
    expect(heatPump.carbonKg.median).toBe(quantile(pairedDifference(forSetup(run.samples, 'gas').carbonKg, forSetup(run.samples, 'heatPump').carbonKg), 0.5));
  });

  it('gives shares cheapest that sum to 1 across the setups run', () => {
    const total = SETUPS.reduce((sum, setup) => sum + forSetup(comparison.shareCheapest, setup), 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('raises the heat pump’s share cheapest when it is made strictly better', () => {
    const setups = ['gas', 'heatPump'] as const;
    const better = runSetups(fixtureAccessor({ 'heating.heatPumpSpf': 3.2 }, { ...RANGES, 'heating.heatPumpSpf': { low: 2.4, high: 4, sigma: 0.15 } }), weather, plan, { setups });
    expect(forSetup(compare(better).shareCheapest, 'heatPump')).toBeGreaterThan(forSetup(compare(runSetups(access, weather, plan, { setups })).shareCheapest, 'heatPump'));
  });

  it('works out each sample’s payback from that sample’s own economics and running costs', () => {
    const years = run.economics.map((economics, sample) => {
      const running = Object.fromEntries(
        SETUPS.map((setup) => [setup, { gasPounds: forSetup(run.samples, setup).gasCostPounds[sample]!, electricityPounds: forSetup(run.samples, setup).electricityCostPounds[sample]! }]),
      );
      return samplePayback('heatPumpSolar', 'heatPump', solarHorizon(economics.capital), economics, running);
    });
    const summary = forSetup(comparison.solarPayback, 'heatPump');
    expect(summary.median).toBe(paybackQuantile(years, 0.5));
    expect(summary.sharePaysBack).toBe(years.filter((year) => year !== DOES_NOT_PAY_BACK).length / years.length);
    expect(upfrontPounds(components('heatPumpSolar', run.centralEconomics))).toBeGreaterThan(upfrontPounds(components('heatPump', run.centralEconomics)));
  });

  it('gives payback against the reference for every other setup, and solar’s own payback on each heating system', () => {
    expect(Object.keys(comparison.payback).toSorted()).toEqual(['gasSolar', 'heatPump', 'heatPumpSolar']);
    expect(Object.keys(comparison.solarPayback).toSorted()).toEqual(['gas', 'heatPump']);
    for (const summary of [...Object.values(comparison.payback), ...Object.values(comparison.solarPayback)]) {
      expect(summary.sharePaysBack).toBeGreaterThanOrEqual(0);
      expect(summary.sharePaysBack).toBeLessThanOrEqual(1);
      expect(summary.p10).toBeLessThanOrEqual(summary.p90);
    }
  });

  it('marks a setup that can never pay back, and leaves out solar’s own payback when a run lacks one side', () => {
    // A heat pump far dearer to run than gas never recovers its extra cost.
    const dear = runSetups(fixtureAccessor({ 'heating.heatPumpSpf': 1, 'costs.heatPumpInstalled': 20_000 }), weather, plan, { setups: ['gas', 'heatPump'] });
    const payback = forSetup(compare(dear).payback, 'heatPump');
    expect(payback.sharePaysBack).toBe(0);
    expect([payback.central, payback.median, payback.p90]).toEqual([DOES_NOT_PAY_BACK, DOES_NOT_PAY_BACK, DOES_NOT_PAY_BACK]);
    expect(compare(dear).solarPayback).toEqual({});
  });

  it('rejects a reference the run left out', () => {
    expect(() => compare(runSetups(access, weather, plan, { setups: ['heatPump'] }))).toThrow(/reference setup "gas" is not in this run/);
  });
});

describe('the well-installed SPF scenario', () => {
  const ranges: FixtureRanges = { ...RANGES, 'heating.heatPumpSpfWellInstalled': { low: 3, high: 4.5, sigma: 0.1 } };
  const access = fixtureAccessor({}, ranges);
  const setups = ['gas', 'heatPump'] as const;
  const fieldTrial = runSetups(access, weather, plan, { setups });
  const wellInstalled = runSetups(access, weather, plan, { setups, spfScenario: 'wellInstalled' });

  it('shares every draw but the SPF, so the gas setup is identical in both scenarios', () => {
    expect(fieldTrial.spfScenario).toBe('fieldTrial');
    expect(wellInstalled.spfScenario).toBe('wellInstalled');
    for (const metric of METRICS) expect(forSetup(wellInstalled.samples, 'gas')[metric]).toEqual(forSetup(fieldTrial.samples, 'gas')[metric]);
    expect(forSetup(wellInstalled.samples, 'heatPump').spaceHeatKwh).toEqual(forSetup(fieldTrial.samples, 'heatPump').spaceHeatKwh);
  });

  it('runs the heat pump on the well-installed SPF, which is higher here in every sample', () => {
    expect(forSetup(wellInstalled.central, 'heatPump').electricityKwh).toBeLessThan(forSetup(fieldTrial.central, 'heatPump').electricityKwh);
    forSetup(wellInstalled.samples, 'heatPump').electricityKwh.forEach((electricity, sample) => {
      expect(electricity).toBeLessThan(forSetup(fieldTrial.samples, 'heatPump').electricityKwh[sample]!);
    });
  });
});
