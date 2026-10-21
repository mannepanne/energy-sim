// ABOUT: Paired runs of any of the 10 setup and tariff combinations on the same seeded samples, keeping only annual totals and economics
// ABOUT: Summarises each metric, the paired differences against the reference, the shares cheapest and payback

import type { RegisterAccessor } from '../register/access.ts';
import { defaultHouse, REFERENCE_ARCHETYPE, type House } from './archetypes.ts';
import { readInputs, type EngineInputs, type SpfScenario } from './inputs.ts';
import {
  components,
  horizonAgainstReference,
  samplePayback,
  solarHorizon,
  summarisePayback,
  upfrontPounds,
  type PaybackSummary,
  type RunningCosts,
  type SampleEconomics,
} from './payback.ts';
import {
  combinationOf,
  forCombination,
  onCap,
  partsOf,
  REFERENCE_COMBINATION,
  type ByCombination,
  type Combination,
} from './combinations.ts';
import { sampleOverrides, type SamplingPlan } from './sampling.ts';
import { SETUP_KIT, SETUPS, setupOf } from './setups.ts';
import type { AnnualResult } from './simulate.ts';
import { checkAgileGiven, runCombinations } from './runCombinations.ts';
import { TARIFFS, type AgileRates, type Tariff } from './tariffs.ts';
import type { PreparedWeather } from './weather.ts';

/** The annual totals kept for each setup in each sample. */
export const METRICS = [
  'spaceHeatKwh',
  'hotWaterKwh',
  'gasKwh',
  'electricityKwh',
  'generationKwh',
  'importKwh',
  'exportKwh',
  'gasCostPounds',
  'electricityCostPounds',
  'costPounds',
  'carbonKg',
  'upfrontPounds',
] as const;
export type Metric = (typeof METRICS)[number];

export type Totals = Record<Metric, number>;

/** One value per sample for each metric. */
export type SampleTotals = Record<Metric, Float64Array>;

export interface SampleRun {
  plan: SamplingPlan;
  house: House;
  spfScenario: SpfScenario;
  /** The combinations run, in the order given. */
  combinations: readonly Combination[];
  /** Every uncertain row at its default. */
  central: ByCombination<Totals>;
  samples: ByCombination<SampleTotals>;
  centralEconomics: SampleEconomics;
  /** One entry per sample, shared by every setup in it. */
  economics: SampleEconomics[];
}

const economicsOf = (inputs: EngineInputs): SampleEconomics => ({
  capital: inputs.capital,
  priceScenario: inputs.priceScenario,
  pvPeakPowerKw: inputs.pv.peakPowerKw,
});

/** The year-one totals of one setup, with its upfront cost after the grant. */
export function totalsOf(annual: AnnualResult, upfront: number): Totals {
  return {
    spaceHeatKwh: annual.spaceHeatKwh,
    hotWaterKwh: annual.hotWaterKwh,
    gasKwh: annual.gasKwh,
    electricityKwh: annual.electricityKwh,
    generationKwh: annual.generationKwh,
    importKwh: annual.importKwh,
    exportKwh: annual.exportKwh,
    gasCostPounds: annual.cost.gasPounds,
    electricityCostPounds: annual.cost.electricityPounds,
    costPounds: annual.cost.totalPounds,
    carbonKg: annual.carbonKg,
    upfrontPounds: upfront,
  };
}

/** Builds a record with one entry per metric. */
export const byMetric = <T>(make: (metric: Metric) => T): Record<Metric, T> => ({
  spaceHeatKwh: make('spaceHeatKwh'),
  hotWaterKwh: make('hotWaterKwh'),
  gasKwh: make('gasKwh'),
  electricityKwh: make('electricityKwh'),
  generationKwh: make('generationKwh'),
  importKwh: make('importKwh'),
  exportKwh: make('exportKwh'),
  gasCostPounds: make('gasCostPounds'),
  electricityCostPounds: make('electricityCostPounds'),
  costPounds: make('costPounds'),
  carbonKg: make('carbonKg'),
  upfrontPounds: make('upfrontPounds'),
});

const emptySampleTotals = (count: number): SampleTotals => byMetric(() => new Float64Array(count));

/** Runs the combinations on one set of inputs, sharing the roof, k and each heat side between them. */
function runOnce(inputs: EngineInputs, weather: PreparedWeather, combinations: readonly Combination[], agile: AgileRates | undefined): ByCombination<Totals> {
  const economics = economicsOf(inputs);
  const annual = runCombinations(inputs, weather, combinations, agile);
  const totals: ByCombination<Totals> = {};
  for (const combination of combinations) {
    totals[combination] = totalsOf(forCombination(annual, combination), upfrontPounds(components(partsOf(combination).setup, economics)));
  }
  return totals;
}

export interface RunOptions {
  /** Defaults to the reference archetype (the 1930s semi) with its default answers. */
  house?: House;
  /** Defaults to `fieldTrial`. */
  spfScenario?: SpfScenario;
  /** Defaults to the four setups on the price cap. */
  combinations?: readonly Combination[];
  /** Agile's rates from the Octopus snapshot (`agileFromSnapshot`), needed when a combination uses Agile. */
  agile?: AgileRates;
}

/**
 * Runs the combinations on the central inputs and on each sample. Every combination in a sample shares one set of inputs.
 * Only the annual totals are kept, because each full result holds about 560 KB of hourly arrays. The weather must be
 * prepared once, from the same register. `spfScenario` picks the heat pump's SPF distribution; every other draw is
 * the same in both scenarios, so they pair. Every row is drawn whichever combinations run, so runs of different
 * combinations pair too.
 */
export function runSamples(access: RegisterAccessor, weather: PreparedWeather, plan: SamplingPlan, options: RunOptions = {}): SampleRun {
  const { spfScenario = 'fieldTrial', combinations = onCap(SETUPS), agile } = options;
  const house = options.house ?? defaultHouse(access, REFERENCE_ARCHETYPE);
  if (combinations.length === 0 || new Set(combinations).size !== combinations.length) {
    throw new Error(`Combinations must be distinct and at least one, got [${combinations.join(', ')}]`);
  }
  combinations.forEach(partsOf);
  checkAgileGiven(combinations, agile);
  const centralInputs = readInputs(access, { house, spfScenario });
  const central = runOnce(centralInputs, weather, combinations, agile);
  const samples: ByCombination<SampleTotals> = Object.fromEntries(combinations.map((combination) => [combination, emptySampleTotals(plan.count)]));
  const economics: SampleEconomics[] = [];
  sampleOverrides(access, plan, house, spfScenario).forEach((overrides, sample) => {
    const inputs = readInputs(access, { house, overrides, spfScenario });
    economics.push(economicsOf(inputs));
    const totals = runOnce(inputs, weather, combinations, agile);
    for (const combination of combinations) {
      const into = forCombination(samples, combination);
      const from = forCombination(totals, combination);
      for (const metric of METRICS) into[metric][sample] = from[metric];
    }
  });
  return { plan, house, spfScenario, combinations, central, samples, centralEconomics: economicsOf(centralInputs), economics };
}

/**
 * The p-th quantile (0–1) by linear interpolation between order statistics
 * (Hyndman and Fan's type 7, the default in R and NumPy).
 */
export function quantile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0) throw new Error('Cannot take a quantile of no values');
  if (!(p >= 0 && p <= 1)) throw new Error(`Quantile must be between 0 and 1, got ${p}`);
  const sorted = Float64Array.from(values).toSorted();
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below]! + (position - below) * (sorted[above]! - sorted[below]!);
}

export interface Band {
  central: number;
  p10: number;
  median: number;
  p90: number;
}

export function band(values: ArrayLike<number>, central: number): Band {
  return { central, p10: quantile(values, 0.1), median: quantile(values, 0.5), p90: quantile(values, 0.9) };
}

/** True when skew puts the central run outside the P10–P90 band. */
export function centralOutsideBand({ central, p10, p90 }: Band): boolean {
  return central < p10 || central > p90;
}

/** Per-sample baseline minus setup. For cost, positive means the setup is cheaper. */
export function pairedDifference(baseline: Float64Array, setup: Float64Array): Float64Array {
  if (baseline.length !== setup.length) throw new Error(`Paired arrays differ in length: ${baseline.length} and ${setup.length}`);
  return baseline.map((value, sample) => value - setup[sample]!);
}

/**
 * The share of samples in which each option costs least. Options tied for the least cost in a sample split that
 * sample equally, so the shares always sum to 1.
 */
export function shareCheapest(costs: readonly Float64Array[]): number[] {
  const first = costs[0];
  if (first === undefined) throw new Error('Cannot compare no options');
  if (first.length === 0) throw new Error('Cannot compare zero samples');
  for (const cost of costs) if (cost.length !== first.length) throw new Error(`Paired arrays differ in length: ${first.length} and ${cost.length}`);
  const shares = costs.map(() => 0);
  for (let sample = 0; sample < first.length; sample += 1) {
    const least = Math.min(...costs.map((cost) => cost[sample]!));
    const cheapest = costs.flatMap((cost, option) => (cost[sample] === least ? [option] : []));
    for (const option of cheapest) shares[option]! += 1 / cheapest.length;
  }
  return shares.map((wins) => wins / first.length);
}

export interface Difference {
  costPounds: Band;
  carbonKg: Band;
}

export interface Comparison {
  reference: Combination;
  bands: ByCombination<Record<Metric, Band>>;
  /** Reference minus combination, per sample, for every combination but the reference. */
  differences: ByCombination<Difference>;
  /** The share of samples in which each combination has the lowest running cost of all run; ties split equally. */
  shareCheapest: ByCombination<number>;
  /** The same within each tariff, among the combinations run on it. */
  shareCheapestByTariff: Partial<Record<Tariff, ByCombination<number>>>;
  /** Each combination against the reference, over its horizon. */
  payback: ByCombination<PaybackSummary>;
  /** Solar against no solar, for each heating system and tariff run both ways, over PV's lifetime; keyed by the combination with solar. */
  solarPayback: ByCombination<PaybackSummary>;
}

const runningCostsOf = (run: SampleRun, totalsFor: (combination: Combination) => Totals): RunningCosts =>
  Object.fromEntries(
    run.combinations.map((combination) => [combination, { gasPounds: totalsFor(combination).gasCostPounds, electricityPounds: totalsFor(combination).electricityCostPounds }]),
  );

/** Payback summary of `option` against `baseline`, with the horizon each sample's economics give. */
function paybackSummary(run: SampleRun, option: Combination, baseline: Combination, horizon: (economics: SampleEconomics) => number): PaybackSummary {
  const centralRunning = runningCostsOf(run, (combination) => forCombination(run.central, combination));
  const central = samplePayback(option, baseline, horizon(run.centralEconomics), run.centralEconomics, centralRunning);
  const years = run.economics.map((economics, sample) => {
    const running = runningCostsOf(run, (combination) => {
      const samples = forCombination(run.samples, combination);
      return byMetric((metric) => samples[metric][sample]!);
    });
    return samplePayback(option, baseline, horizon(economics), economics, running);
  });
  return summarisePayback(years, central);
}

/** Shares cheapest among some of the run's combinations, keyed by combination. */
function sharesAmong(run: SampleRun, combinations: readonly Combination[]): ByCombination<number> {
  const shares = shareCheapest(combinations.map((combination) => forCombination(run.samples, combination).costPounds));
  return Object.fromEntries(combinations.map((combination, index) => [combination, shares[index]!]));
}

export function compare(run: SampleRun, reference: Combination = REFERENCE_COMBINATION): Comparison {
  if (!run.combinations.includes(reference)) throw new Error(`The reference combination "${reference}" is not in this run`);
  const others = run.combinations.filter((combination) => combination !== reference);
  const referenceSamples = forCombination(run.samples, reference);
  const referenceCentral = forCombination(run.central, reference);
  const differenceBand = (combination: Combination, metric: 'costPounds' | 'carbonKg'): Band =>
    band(
      pairedDifference(referenceSamples[metric], forCombination(run.samples, combination)[metric]),
      referenceCentral[metric] - forCombination(run.central, combination)[metric],
    );
  const shareCheapestByTariff: Partial<Record<Tariff, ByCombination<number>>> = {};
  for (const tariff of TARIFFS) {
    const onTariff = run.combinations.filter((combination) => partsOf(combination).tariff === tariff);
    if (onTariff.length > 0) shareCheapestByTariff[tariff] = sharesAmong(run, onTariff);
  }
  const solarPayback: ByCombination<PaybackSummary> = {};
  for (const combination of run.combinations) {
    const { setup, tariff } = partsOf(combination);
    const { heating, solar } = SETUP_KIT[setup];
    const without = combinationOf(setupOf(heating, false), tariff);
    if (solar && run.combinations.includes(without)) {
      solarPayback[combination] = paybackSummary(run, combination, without, (economics) => solarHorizon(economics.capital));
    }
  }
  return {
    reference,
    bands: Object.fromEntries(
      run.combinations.map((combination) => [
        combination,
        byMetric((metric) => band(forCombination(run.samples, combination)[metric], forCombination(run.central, combination)[metric])),
      ]),
    ),
    differences: Object.fromEntries(
      others.map((combination) => [combination, { costPounds: differenceBand(combination, 'costPounds'), carbonKg: differenceBand(combination, 'carbonKg') }]),
    ),
    shareCheapest: sharesAmong(run, run.combinations),
    shareCheapestByTariff,
    payback: Object.fromEntries(
      others.map((combination) => [
        combination,
        paybackSummary(run, combination, reference, (economics) => horizonAgainstReference(combination, economics.capital)),
      ]),
    ),
    solarPayback,
  };
}
