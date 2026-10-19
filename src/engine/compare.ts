// ABOUT: Paired runs of the gas and heat pump setups on the same seeded samples, keeping only annual totals
// ABOUT: Summarises each metric as central, P10, median and P90, and the paired difference with the share of wins

import type { RegisterAccessor } from '../register/access.ts';
import { defaultHouse, REFERENCE_ARCHETYPE, type House } from './archetypes.ts';
import { readInputs, type SpfScenario } from './inputs.ts';
import { sampleOverrides, type SamplingPlan } from './sampling.ts';
import { simulate, solarGeneration, type AnnualResult, type Setup } from './simulate.ts';
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
  'costPounds',
  'carbonKg',
] as const;
export type Metric = (typeof METRICS)[number];

export type Totals = Record<Metric, number>;

/** One value per sample for each metric. */
export type SampleTotals = Record<Metric, Float64Array>;

export interface PairedRun {
  plan: SamplingPlan;
  house: House;
  spfScenario: SpfScenario;
  /** Whether both setups have roof solar. */
  solar: boolean;
  /** Every uncertain row at its default. */
  central: Record<Setup, Totals>;
  samples: Record<Setup, SampleTotals>;
}

export function totalsOf(annual: AnnualResult): Totals {
  return {
    spaceHeatKwh: annual.spaceHeatKwh,
    hotWaterKwh: annual.hotWaterKwh,
    gasKwh: annual.gasKwh,
    electricityKwh: annual.electricityKwh,
    generationKwh: annual.generationKwh,
    importKwh: annual.importKwh,
    exportKwh: annual.exportKwh,
    costPounds: annual.cost.totalPounds,
    carbonKg: annual.carbonKg,
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
  costPounds: make('costPounds'),
  carbonKg: make('carbonKg'),
});

const emptySampleTotals = (count: number): SampleTotals => byMetric(() => new Float64Array(count));

export interface PairedOptions {
  /** Gives both setups roof solar: gas with solar against the heat pump with solar. Defaults to false. */
  solar?: boolean;
}

/**
 * Runs both setups on the central inputs and on each sample. Both setups in a sample share one set of inputs.
 * Only the annual totals are kept, because each full result holds about 560 KB of hourly arrays.
 * The weather must be prepared once, from the same register. `spfScenario` picks the heat pump's SPF distribution;
 * every other draw is the same in both scenarios, so they pair. With `solar`, the solar rows' draws are the same as
 * without, so a run with solar pairs with one without, sample by sample.
 */
export function runPaired(
  access: RegisterAccessor,
  weather: PreparedWeather,
  plan: SamplingPlan,
  house: House = defaultHouse(access, REFERENCE_ARCHETYPE),
  spfScenario: SpfScenario = 'fieldTrial',
  { solar = false }: PairedOptions = {},
): PairedRun {
  const centralInputs = readInputs(access, { house, spfScenario });
  const central = {
    gas: totalsOf(simulate(centralInputs, weather, 'gas', { solar }).annual),
    heatPump: totalsOf(simulate(centralInputs, weather, 'heatPump', { solar }).annual),
  };
  const draws = sampleOverrides(access, plan, house, spfScenario);
  const samples = { gas: emptySampleTotals(plan.count), heatPump: emptySampleTotals(plan.count) };
  draws.forEach((overrides, sample) => {
    const inputs = readInputs(access, { house, overrides, spfScenario });
    // Both setups share one roof, so its generation is computed once a sample.
    const generationKwh = solar ? solarGeneration(inputs, weather) : undefined;
    for (const setup of ['gas', 'heatPump'] as const) {
      const totals = totalsOf(simulate(inputs, weather, setup, { solar, ...(generationKwh && { generationKwh }) }).annual);
      for (const metric of METRICS) samples[setup][metric][sample] = totals[metric];
    }
  });
  return { plan, house, spfScenario, solar, central, samples };
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

/** Per-sample gas minus heat pump. For cost, positive means the heat pump is cheaper. */
export function pairedDifference(gas: Float64Array, heatPump: Float64Array): Float64Array {
  if (gas.length !== heatPump.length) throw new Error(`Paired arrays differ in length: ${gas.length} and ${heatPump.length}`);
  return gas.map((value, sample) => value - heatPump[sample]!);
}

/** The share of samples in which the heat pump costs less. An exact tie counts as half a win. */
export function shareHeatPumpCheaper(gasCost: Float64Array, heatPumpCost: Float64Array): number {
  const difference = pairedDifference(gasCost, heatPumpCost);
  if (difference.length === 0) throw new Error('Cannot compare zero samples');
  const wins = difference.reduce((total, value) => total + (value > 0 ? 1 : value === 0 ? 0.5 : 0), 0);
  return wins / difference.length;
}

export interface Comparison {
  bands: Record<Setup, Record<Metric, Band>>;
  /** Gas minus heat pump, per sample. */
  costDifference: Band;
  carbonDifference: Band;
  shareHeatPumpCheaper: number;
}

export function compare(run: PairedRun): Comparison {
  const bandsFor = (setup: Setup): Record<Metric, Band> => byMetric((metric) => band(run.samples[setup][metric], run.central[setup][metric]));
  const { gas, heatPump } = run.samples;
  return {
    bands: { gas: bandsFor('gas'), heatPump: bandsFor('heatPump') },
    costDifference: band(pairedDifference(gas.costPounds, heatPump.costPounds), run.central.gas.costPounds - run.central.heatPump.costPounds),
    carbonDifference: band(pairedDifference(gas.carbonKg, heatPump.carbonKg), run.central.gas.carbonKg - run.central.heatPump.carbonKg),
    shareHeatPumpCheaper: shareHeatPumpCheaper(gas.costPounds, heatPump.costPounds),
  };
}
