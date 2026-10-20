// ABOUT: Paired runs of any of the four setups on the same seeded samples, keeping only annual totals and economics
// ABOUT: Summarises each metric, the paired differences against the reference, the share cheapest and payback

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
import { sampleOverrides, type SamplingPlan } from './sampling.ts';
import { forSetup, REFERENCE_SETUP, SETUP_KIT, SETUPS, setupOf, type BySetup, type Setup } from './setups.ts';
import { simulate, solarGeneration, type AnnualResult, type Heating } from './simulate.ts';
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

export interface SetupRun {
  plan: SamplingPlan;
  house: House;
  spfScenario: SpfScenario;
  /** The setups run, in the order given. */
  setups: readonly Setup[];
  /** Every uncertain row at its default. */
  central: BySetup<Totals>;
  samples: BySetup<SampleTotals>;
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

/** Runs the setups on one set of inputs. The setups with solar share one roof, so its generation is computed once. */
function runOnce(inputs: EngineInputs, weather: PreparedWeather, setups: readonly Setup[]): BySetup<Totals> {
  const economics = economicsOf(inputs);
  const generationKwh = setups.some((setup) => SETUP_KIT[setup].solar) ? solarGeneration(inputs, weather) : undefined;
  const totals: BySetup<Totals> = {};
  for (const setup of setups) {
    const { heating, solar } = SETUP_KIT[setup];
    const annual = simulate(inputs, weather, heating, { solar, ...(solar && generationKwh && { generationKwh }) }).annual;
    totals[setup] = totalsOf(annual, upfrontPounds(components(setup, economics)));
  }
  return totals;
}

export interface RunOptions {
  /** Defaults to the reference archetype (the 1930s semi) with its default answers. */
  house?: House;
  /** Defaults to `fieldTrial`. */
  spfScenario?: SpfScenario;
  /** Defaults to all four. */
  setups?: readonly Setup[];
}

/**
 * Runs the setups on the central inputs and on each sample. Every setup in a sample shares one set of inputs.
 * Only the annual totals are kept, because each full result holds about 560 KB of hourly arrays. The weather must be
 * prepared once, from the same register. `spfScenario` picks the heat pump's SPF distribution; every other draw is
 * the same in both scenarios, so they pair. Every row is drawn whichever setups run, so runs of different setups
 * pair too.
 */
export function runSetups(access: RegisterAccessor, weather: PreparedWeather, plan: SamplingPlan, options: RunOptions = {}): SetupRun {
  const { spfScenario = 'fieldTrial', setups = SETUPS } = options;
  const house = options.house ?? defaultHouse(access, REFERENCE_ARCHETYPE);
  if (setups.length === 0 || new Set(setups).size !== setups.length) throw new Error(`Setups must be distinct and at least one, got [${setups.join(', ')}]`);
  const centralInputs = readInputs(access, { house, spfScenario });
  const central = runOnce(centralInputs, weather, setups);
  const samples: BySetup<SampleTotals> = Object.fromEntries(setups.map((setup) => [setup, emptySampleTotals(plan.count)]));
  const economics: SampleEconomics[] = [];
  sampleOverrides(access, plan, house, spfScenario).forEach((overrides, sample) => {
    const inputs = readInputs(access, { house, overrides, spfScenario });
    economics.push(economicsOf(inputs));
    const totals = runOnce(inputs, weather, setups);
    for (const setup of setups) {
      const into = forSetup(samples, setup);
      const from = forSetup(totals, setup);
      for (const metric of METRICS) into[metric][sample] = from[metric];
    }
  });
  return { plan, house, spfScenario, setups, central, samples, centralEconomics: economicsOf(centralInputs), economics };
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
  reference: Setup;
  bands: BySetup<Record<Metric, Band>>;
  /** Reference minus setup, per sample, for every setup but the reference. */
  differences: BySetup<Difference>;
  /** The share of samples in which each setup has the lowest running cost; ties split equally. */
  shareCheapest: BySetup<number>;
  /** Each setup against the reference, over its horizon. */
  payback: BySetup<PaybackSummary>;
  /** Solar against no solar on each heating system run both ways, over PV's lifetime. */
  solarPayback: Partial<Record<Heating, PaybackSummary>>;
}

const runningCostsOf = (run: SetupRun, totalsFor: (setup: Setup) => Totals): RunningCosts =>
  Object.fromEntries(run.setups.map((setup) => [setup, { gasPounds: totalsFor(setup).gasCostPounds, electricityPounds: totalsFor(setup).electricityCostPounds }]));

/** Payback summary of `option` against `baseline`, with the horizon each sample's economics give. */
function paybackSummary(run: SetupRun, option: Setup, baseline: Setup, horizon: (economics: SampleEconomics) => number): PaybackSummary {
  const centralRunning = runningCostsOf(run, (setup) => forSetup(run.central, setup));
  const central = samplePayback(option, baseline, horizon(run.centralEconomics), run.centralEconomics, centralRunning);
  const years = run.economics.map((economics, sample) => {
    const running = runningCostsOf(run, (setup) => {
      const samples = forSetup(run.samples, setup);
      return byMetric((metric) => samples[metric][sample]!);
    });
    return samplePayback(option, baseline, horizon(economics), economics, running);
  });
  return summarisePayback(years, central);
}

export function compare(run: SetupRun, reference: Setup = REFERENCE_SETUP): Comparison {
  if (!run.setups.includes(reference)) throw new Error(`The reference setup "${reference}" is not in this run`);
  const others = run.setups.filter((setup) => setup !== reference);
  const referenceSamples = forSetup(run.samples, reference);
  const referenceCentral = forSetup(run.central, reference);
  const differenceBand = (setup: Setup, metric: 'costPounds' | 'carbonKg'): Band =>
    band(pairedDifference(referenceSamples[metric], forSetup(run.samples, setup)[metric]), referenceCentral[metric] - forSetup(run.central, setup)[metric]);
  const shares = shareCheapest(run.setups.map((setup) => forSetup(run.samples, setup).costPounds));
  const solarPayback: Partial<Record<Heating, PaybackSummary>> = {};
  for (const heating of ['gas', 'heatPump'] as const) {
    const [without, withSolar] = [setupOf(heating, false), setupOf(heating, true)];
    if (run.setups.includes(without) && run.setups.includes(withSolar)) {
      solarPayback[heating] = paybackSummary(run, withSolar, without, (economics) => solarHorizon(economics.capital));
    }
  }
  return {
    reference,
    bands: Object.fromEntries(
      run.setups.map((setup) => [setup, byMetric((metric) => band(forSetup(run.samples, setup)[metric], forSetup(run.central, setup)[metric]))]),
    ),
    differences: Object.fromEntries(others.map((setup) => [setup, { costPounds: differenceBand(setup, 'costPounds'), carbonKg: differenceBand(setup, 'carbonKg') }])),
    shareCheapest: Object.fromEntries(run.setups.map((setup, index) => [setup, shares[index]!])),
    payback: Object.fromEntries(
      others.map((setup) => [setup, paybackSummary(run, setup, reference, (economics) => horizonAgainstReference(setup, economics.capital))]),
    ),
    solarPayback,
  };
}
