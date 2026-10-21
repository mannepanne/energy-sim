// ABOUT: Checks the paired runs of N setups and their summaries: the central run uses defaults, collapsed ranges collapse
// ABOUT: the band, ties split the share cheapest, setups pair sample by sample, and payback follows each sample's economics

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { band, centralOutsideBand, compare, METRICS, pairedDifference, quantile, runSamples, shareCheapest } from './compare.ts';
import { components, DOES_NOT_PAY_BACK, paybackQuantile, samplePayback, solarHorizon, upfrontPounds } from './payback.ts';
import { COMBINATIONS, forCombination, onCap, partsOf, type Combination } from './combinations.ts';
import { agileFromSnapshot } from './tariffs.ts';
import { loadOctopusSnapshot } from '../snapshots/octopusSchema.ts';
import { SETUP_KIT, SETUPS } from './setups.ts';
import { defaultHouse } from './archetypes.ts';
import { readInputs } from './inputs.ts';
import { simulate } from './simulate.ts';
import { fixtureAccessor, type FixtureRanges } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const CAP = onCap(SETUPS);

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

describe('runSamples', () => {
  const access = fixtureAccessor({}, RANGES);
  const run = runSamples(access, weather, plan);
  const samples = (setup: Combination) => forCombination(run.samples, setup);

  it('runs the four setups on the price cap by default, and the central case with every uncertain row at its default', () => {
    expect(run.combinations).toEqual(CAP);
    const inputs = readInputs(access);
    expect(forCombination(run.central, 'gas/cap').costPounds).toBe(simulate(inputs, weather, 'gas').annual.cost.totalPounds);
    expect(forCombination(run.central, 'heatPump/cap').carbonKg).toBe(simulate(inputs, weather, 'heatPump').annual.carbonKg);
    expect(forCombination(run.central, 'heatPumpSolar/cap').costPounds).toBe(simulate(inputs, weather, 'heatPump', { solar: true }).annual.cost.totalPounds);
  });

  it('keeps one annual total per sample for each metric and setup, and one set of economics per sample', () => {
    for (const setup of CAP) for (const metric of METRICS) expect(samples(setup)[metric]).toHaveLength(plan.count);
    expect(run.economics).toHaveLength(plan.count);
  });

  it('splits the running cost into a gas part and an electricity part net of export', () => {
    for (const setup of CAP) {
      const totals = forCombination(run.central, setup);
      expect(totals.gasCostPounds + totals.electricityCostPounds).toBeCloseTo(totals.costPounds, 9);
    }
    expect(forCombination(run.central, 'heatPump/cap').gasCostPounds).toBe(0);
  });

  it('gives identical results for the same seed and different results for another seed', () => {
    // Only the heat pump setup is rerun: runs of some setups pair with runs of all four (the next test).
    const heatPumpOnly = { combinations: ['heatPump/cap'] } as const;
    expect(forCombination(runSamples(access, weather, plan, heatPumpOnly).samples, 'heatPump/cap').costPounds).toEqual(samples('heatPump/cap').costPounds);
    expect(forCombination(runSamples(access, weather, { ...plan, seed: 12 }, heatPumpOnly).samples, 'heatPump/cap').costPounds).not.toEqual(samples('heatPump/cap').costPounds);
  });

  it('pairs a run of some setups with a run of all four, sample by sample', () => {
    const two = runSamples(access, weather, plan, { combinations: ['gas/cap', 'heatPump/cap'] });
    expect(two.central['gasSolar/cap']).toBeUndefined();
    expect(forCombination(two.samples, 'heatPump/cap').costPounds).toEqual(samples('heatPump/cap').costPounds);
    expect(two.economics).toEqual(run.economics);
    expect(() => forCombination(two.samples, 'gasSolar/cap')).toThrow(/"gasSolar\/cap" is not in this run/);
  });

  it('rejects an empty or repeated list of setups', () => {
    expect(() => runSamples(access, weather, plan, { combinations: [] })).toThrow(/distinct and at least one/);
    expect(() => runSamples(access, weather, plan, { combinations: ['gas/cap', 'gas/cap'] })).toThrow(/distinct and at least one/);
  });

  it('gives the solar setups one roof, and lowers imports and cost in every sample', () => {
    expect(samples('gas/cap').generationKwh.every((value) => value === 0)).toBe(true);
    expect(samples('gasSolar/cap').generationKwh).toEqual(samples('heatPumpSolar/cap').generationKwh);
    expect(samples('gasSolar/cap').spaceHeatKwh).toEqual(samples('gas/cap').spaceHeatKwh);
    samples('heatPumpSolar/cap').importKwh.forEach((imported, sample) => {
      expect(imported).toBeLessThan(samples('heatPump/cap').importKwh[sample]!);
      expect(samples('heatPumpSolar/cap').costPounds[sample]!).toBeLessThan(samples('heatPump/cap').costPounds[sample]!);
    });
  });

  it('runs every setup on the same inputs in each sample, so space heat matches sample by sample', () => {
    for (const setup of CAP) expect(samples(setup).spaceHeatKwh).toEqual(samples('gas/cap').spaceHeatKwh);
  });

  it('keeps each setup’s upfront cost after the grant', () => {
    const { capital, pvPeakPowerKw } = run.centralEconomics;
    expect(forCombination(run.central, 'gas/cap').upfrontPounds).toBe(2_000);
    expect(forCombination(run.central, 'heatPump/cap').upfrontPounds).toBe(12_000 - 7_500);
    expect(forCombination(run.central, 'heatPumpSolar/cap').upfrontPounds).toBe(12_000 - 7_500 + pvPeakPowerKw * capital.pvPoundsPerKwp);
    expect(pvPeakPowerKw).toBe(4);
  });

  it('applies the house to the central run and every sample', () => {
    const house = { ...defaultHouse(access, 'semi1930s'), loft: 'none' as const };
    const variant = runSamples(access, weather, plan, { house, combinations: ['gas/cap'] });
    expect(variant.house).toEqual(house);
    expect(forCombination(variant.central, 'gas/cap').spaceHeatKwh).toBeGreaterThan(forCombination(run.central, 'gas/cap').spaceHeatKwh);
    forCombination(variant.samples, 'gas/cap').spaceHeatKwh.forEach((kwh, sample) => expect(kwh).toBeGreaterThan(samples('gas/cap').spaceHeatKwh[sample]!));
  });

  it('lowers heat pump electricity in every sample when the SPF is higher', () => {
    const higher = runSamples(fixtureAccessor({ 'heating.heatPumpSpf': 2.8 }, { ...RANGES, 'heating.heatPumpSpf': { low: 2.3, high: 3.8, sigma: 0.15 } }), weather, plan, {
      combinations: ['heatPump/cap'],
    });
    samples('heatPump/cap').electricityKwh.forEach((kwh, sample) => expect(forCombination(higher.samples, 'heatPump/cap').electricityKwh[sample]).toBeLessThan(kwh));
  });
});

describe('compare', () => {
  const access = fixtureAccessor({}, RANGES);
  const run = runSamples(access, weather, plan);
  const comparison = compare(run);

  it('collapses every band to the central value when every range is collapsed', () => {
    const collapsed = compare(runSamples(fixtureAccessor(), weather, plan));
    for (const setup of CAP) {
      for (const metric of METRICS) {
        const { central, p10, median, p90 } = forCombination(collapsed.bands, setup)[metric];
        expect([p10, median, p90]).toEqual([central, central, central]);
      }
    }
    const difference = forCombination(collapsed.differences, 'heatPump/cap').costPounds;
    expect(difference.p10).toBe(difference.central);
  });

  it('reports paired differences as reference minus setup, for every setup but the reference', () => {
    expect(comparison.reference).toBe('gas/cap');
    expect(comparison.differences['gas/cap']).toBeUndefined();
    const heatPump = forCombination(comparison.differences, 'heatPump/cap');
    expect(heatPump.costPounds.central).toBeCloseTo(forCombination(run.central, 'gas/cap').costPounds - forCombination(run.central, 'heatPump/cap').costPounds, 9);
    expect(heatPump.carbonKg.median).toBe(quantile(pairedDifference(forCombination(run.samples, 'gas/cap').carbonKg, forCombination(run.samples, 'heatPump/cap').carbonKg), 0.5));
  });

  it('gives shares cheapest that sum to 1 across the setups run', () => {
    const total = CAP.reduce((sum, setup) => sum + forCombination(comparison.shareCheapest, setup), 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('raises the heat pump’s share cheapest when it is made strictly better', () => {
    const setups = ['gas/cap', 'heatPump/cap'] as const;
    const better = runSamples(fixtureAccessor({ 'heating.heatPumpSpf': 3.2 }, { ...RANGES, 'heating.heatPumpSpf': { low: 2.4, high: 4, sigma: 0.15 } }), weather, plan, { combinations: setups });
    expect(forCombination(compare(better).shareCheapest, 'heatPump/cap')).toBeGreaterThan(forCombination(compare(runSamples(access, weather, plan, { combinations: setups })).shareCheapest, 'heatPump/cap'));
  });

  it('works out each sample’s payback from that sample’s own economics and running costs', () => {
    const years = run.economics.map((economics, sample) => {
      const running = Object.fromEntries(
        CAP.map((setup) => [setup, { gasPounds: forCombination(run.samples, setup).gasCostPounds[sample]!, electricityPounds: forCombination(run.samples, setup).electricityCostPounds[sample]! }]),
      );
      return samplePayback('heatPumpSolar/cap', 'heatPump/cap', solarHorizon(economics.capital), economics, running);
    });
    const summary = forCombination(comparison.solarPayback, 'heatPumpSolar/cap');
    expect(summary.median).toBe(paybackQuantile(years, 0.5));
    expect(summary.sharePaysBack).toBe(years.filter((year) => year !== DOES_NOT_PAY_BACK).length / years.length);
    expect(upfrontPounds(components('heatPumpSolar', run.centralEconomics))).toBeGreaterThan(upfrontPounds(components('heatPump', run.centralEconomics)));
  });

  it('gives payback against the reference for every other setup, and solar’s own payback on each heating system', () => {
    expect(Object.keys(comparison.payback).toSorted()).toEqual(['gasSolar/cap', 'heatPump/cap', 'heatPumpSolar/cap']);
    expect(Object.keys(comparison.solarPayback).toSorted()).toEqual(['gasSolar/cap', 'heatPumpSolar/cap']);
    for (const summary of [...Object.values(comparison.payback), ...Object.values(comparison.solarPayback)]) {
      expect(summary.sharePaysBack).toBeGreaterThanOrEqual(0);
      expect(summary.sharePaysBack).toBeLessThanOrEqual(1);
      expect(summary.p10).toBeLessThanOrEqual(summary.p90);
    }
  });

  it('marks a setup that can never pay back, and leaves out solar’s own payback when a run lacks one side', () => {
    // A heat pump far dearer to run than gas never recovers its extra cost.
    const dear = runSamples(fixtureAccessor({ 'heating.heatPumpSpf': 1, 'costs.heatPumpInstalled': 20_000 }), weather, plan, { combinations: ['gas/cap', 'heatPump/cap'] });
    const payback = forCombination(compare(dear).payback, 'heatPump/cap');
    expect(payback.sharePaysBack).toBe(0);
    expect([payback.central, payback.median, payback.p90]).toEqual([DOES_NOT_PAY_BACK, DOES_NOT_PAY_BACK, DOES_NOT_PAY_BACK]);
    expect(compare(dear).solarPayback).toEqual({});
  });

  it('rejects a reference the run left out', () => {
    expect(() => compare(runSamples(access, weather, plan, { combinations: ['heatPump/cap'] }))).toThrow(/reference combination "gas\/cap" is not in this run/);
  });
});

describe('the well-installed SPF scenario', () => {
  const ranges: FixtureRanges = { ...RANGES, 'heating.heatPumpSpfWellInstalled': { low: 3, high: 4.5, sigma: 0.1 } };
  const access = fixtureAccessor({}, ranges);
  const setups = ['gas/cap', 'heatPump/cap'] as const;
  const fieldTrial = runSamples(access, weather, plan, { combinations: setups });
  const wellInstalled = runSamples(access, weather, plan, { combinations: setups, spfScenario: 'wellInstalled' });

  it('shares every draw but the SPF, so the gas setup is identical in both scenarios', () => {
    expect(fieldTrial.spfScenario).toBe('fieldTrial');
    expect(wellInstalled.spfScenario).toBe('wellInstalled');
    for (const metric of METRICS) expect(forCombination(wellInstalled.samples, 'gas/cap')[metric]).toEqual(forCombination(fieldTrial.samples, 'gas/cap')[metric]);
    expect(forCombination(wellInstalled.samples, 'heatPump/cap').spaceHeatKwh).toEqual(forCombination(fieldTrial.samples, 'heatPump/cap').spaceHeatKwh);
  });

  it('runs the heat pump on the well-installed SPF, which is higher here in every sample', () => {
    expect(forCombination(wellInstalled.central, 'heatPump/cap').electricityKwh).toBeLessThan(forCombination(fieldTrial.central, 'heatPump/cap').electricityKwh);
    forCombination(wellInstalled.samples, 'heatPump/cap').electricityKwh.forEach((electricity, sample) => {
      expect(electricity).toBeLessThan(forCombination(fieldTrial.samples, 'heatPump/cap').electricityKwh[sample]!);
    });
  });
});

const sumShares = (shares: Partial<Record<Combination, number>>): number => Object.values(shares).reduce((total, value) => total + value, 0);

describe('the tariff grid', () => {
  const access = fixtureAccessor({}, { ...RANGES, 'heating.controlBoost': { low: 1, high: 2 } });
  const octopus = loadOctopusSnapshot(JSON.parse(readFileSync(new URL('../../data/snapshots/octopus-london.json', import.meta.url), 'utf8')) as unknown);
  const agile = agileFromSnapshot(octopus);
  const run = runSamples(access, weather, plan, { combinations: COMBINATIONS, agile });
  const comparison = compare(run);

  it('pairs every combination on one set of draws, so the cap runs match a run of the cap alone', () => {
    const capOnly = runSamples(access, weather, plan, { combinations: CAP });
    for (const combination of CAP) expect(forCombination(run.samples, combination).costPounds).toEqual(forCombination(capOnly.samples, combination).costPounds);
    expect(run.economics).toEqual(capOnly.economics);
  });

  it('keeps gas on the price cap: the gas boiler’s gas cost is the same on Agile', () => {
    expect(forCombination(run.samples, 'gas/agile').gasCostPounds).toEqual(forCombination(run.samples, 'gas/cap').gasCostPounds);
  });

  it('gives shares cheapest across all 10, and within each tariff, that each sum to 1', () => {
    expect(sumShares(comparison.shareCheapest)).toBeCloseTo(1, 12);
    expect(Object.keys(comparison.shareCheapestByTariff)).toEqual(['cap', 'cosy', 'agile']);
    expect(Object.values(comparison.shareCheapestByTariff).map((shares) => Math.round(sumShares(shares) * 1e9) / 1e9)).toEqual([1, 1, 1]);
    expect(Object.keys(comparison.shareCheapestByTariff.cosy!)).toEqual(['heatPump/cosy', 'heatPumpSolar/cosy']);
  });

  it('gives payback against the gas boiler on the cap for the other 9, and solar’s own payback on each heating system and tariff', () => {
    expect(Object.keys(comparison.payback)).toHaveLength(9);
    expect(Object.keys(comparison.solarPayback).toSorted()).toEqual(COMBINATIONS.filter((combination) => SETUP_KIT[partsOf(combination).setup].solar).toSorted());
  });

  it('refuses an Agile combination without Agile’s rates, before running anything', () => {
    expect(() => runSamples(access, weather, plan, { combinations: ['heatPump/agile'] })).toThrow(/needs Agile's rates/);
  });
});
