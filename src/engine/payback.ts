// ABOUT: Upfront cost after the grant, replacements inside a horizon, and the payback year of one setup against another
// ABOUT: Running costs change each year under a shared real price scenario; payback is undiscounted, in whole years

import { forSetup, SETUP_KIT, type BySetup, type Setup } from './setups.ts';

/** Installed costs at today's real prices, the grant and lifetimes, as read from the register. */
export interface CapitalCosts {
  boilerPounds: number;
  /** Before the grant, including the cylinder and typical radiator changes. */
  heatPumpPounds: number;
  pvPoundsPerKwp: number;
  /** The Boiler Upgrade Scheme grant, for a heat pump only. */
  grantPounds: number;
  boilerLifetimeYears: number;
  heatPumpLifetimeYears: number;
  pvLifetimeYears: number;
}

/** Real price changes a year, as fractions. Each scales its fuel's unit rates and standing charge; export follows electricity. */
export interface PriceScenario {
  gasChangePerYear: number;
  electricityChangePerYear: number;
}

/** A piece of kit: what it costs now, what a replacement costs, and how long it lasts in whole years. */
export interface Component {
  name: 'boiler' | 'heatPump' | 'pv';
  installPounds: number;
  replacementPounds: number;
  lifetimeYears: number;
}

/** A year's running cost split by fuel, so each part can follow its own price change. */
export interface RunningCost {
  gasPounds: number;
  /** Imports less export income. */
  electricityPounds: number;
}

/** A sample's capital costs and price scenario, and the PV size its solar setups have. */
export interface SampleEconomics {
  capital: CapitalCosts;
  priceScenario: PriceScenario;
  pvPeakPowerKw: number;
}

/** Marks a sample that doesn't pay back within its horizon. It ranks after every year. */
export const DOES_NOT_PAY_BACK = Number.POSITIVE_INFINITY;

/** A lifetime rounded to whole years, at least one. */
export const wholeYears = (years: number): number => Math.max(1, Math.round(years));

/**
 * The kit a setup buys. The grant comes off the heat pump's first installation, capped at its cost, and never
 * off a replacement: a property that has had the grant cannot claim it again.
 */
export function components(setup: Setup, { capital, pvPeakPowerKw }: Pick<SampleEconomics, 'capital' | 'pvPeakPowerKw'>): Component[] {
  const { heating, solar } = SETUP_KIT[setup];
  const kit: Component[] =
    heating === 'gas'
      ? [{ name: 'boiler', installPounds: capital.boilerPounds, replacementPounds: capital.boilerPounds, lifetimeYears: wholeYears(capital.boilerLifetimeYears) }]
      : [
          {
            name: 'heatPump',
            installPounds: Math.max(0, capital.heatPumpPounds - capital.grantPounds),
            replacementPounds: capital.heatPumpPounds,
            lifetimeYears: wholeYears(capital.heatPumpLifetimeYears),
          },
        ];
  if (solar) {
    const pvPounds = pvPeakPowerKw * capital.pvPoundsPerKwp;
    kit.push({ name: 'pv', installPounds: pvPounds, replacementPounds: pvPounds, lifetimeYears: wholeYears(capital.pvLifetimeYears) });
  }
  return kit;
}

/** What a setup costs to install now, after the grant. */
export const upfrontPounds = (kit: readonly Component[]): number => kit.reduce((total, part) => total + part.installPounds, 0);

/**
 * Replacements paid at the end of `year`: each component whose lifetime ends then, while still inside the horizon.
 * A lifetime ending exactly at the horizon is not replaced, because the horizon ends with it.
 */
export function replacementPounds(kit: readonly Component[], year: number, horizonYears: number): number {
  if (year >= horizonYears) return 0;
  return kit.reduce((total, part) => total + (year % part.lifetimeYears === 0 ? part.replacementPounds : 0), 0);
}

/** The running cost in year `year` (1 is today's prices): each fuel's part grows by its change once a year. */
export function runningCostInYear(cost: RunningCost, scenario: PriceScenario, year: number): number {
  return cost.gasPounds * (1 + scenario.gasChangePerYear) ** (year - 1) + cost.electricityPounds * (1 + scenario.electricityChangePerYear) ** (year - 1);
}

/** One side of a payback comparison: its kit and its first year's running cost. */
export interface PaybackSide {
  kit: readonly Component[];
  running: RunningCost;
}

/**
 * The first whole year by which `option` has recovered its extra upfront cost against `baseline`: cumulative
 * running-cost savings, plus the baseline's replacements less the option's, cover the extra upfront.
 * Year 0 when the option costs no more up front. `DOES_NOT_PAY_BACK` when it hasn't by the end of the horizon,
 * including when it costs more to run. The position is checked at the end of each year, after that year's
 * replacements.
 */
export function paybackYear(option: PaybackSide, baseline: PaybackSide, horizonYears: number, scenario: PriceScenario): number {
  if (!Number.isInteger(horizonYears) || horizonYears < 1) throw new Error(`The payback horizon must be a whole number of years, got ${horizonYears}`);
  const extraUpfront = upfrontPounds(option.kit) - upfrontPounds(baseline.kit);
  if (extraUpfront <= 0) return 0;
  let position = -extraUpfront;
  for (let year = 1; year <= horizonYears; year += 1) {
    position += runningCostInYear(baseline.running, scenario, year) - runningCostInYear(option.running, scenario, year);
    position += replacementPounds(baseline.kit, year, horizonYears) - replacementPounds(option.kit, year, horizonYears);
    if (position >= 0) return year;
  }
  return DOES_NOT_PAY_BACK;
}

/**
 * The horizon for a setup against the reference: the heat pump's lifetime for heat pump setups, with or without
 * solar (any PV value left at the end is ignored), and PV's lifetime for gas with solar.
 */
export function horizonAgainstReference(setup: Setup, capital: CapitalCosts): number {
  const { heating, solar } = SETUP_KIT[setup];
  if (heating === 'heatPump') return wholeYears(capital.heatPumpLifetimeYears);
  if (solar) return wholeYears(capital.pvLifetimeYears);
  throw new Error(`Setup "${setup}" is the reference and has no payback against itself`);
}

/** Solar's own payback, on either heating system, runs over PV's lifetime. */
export const solarHorizon = (capital: CapitalCosts): number => wholeYears(capital.pvLifetimeYears);

/** Per-setup running costs for one sample (or the central run). */
export type RunningCosts = BySetup<RunningCost>;

/** The payback year of `option` against `baseline` in one sample, with the given horizon. */
export function samplePayback(option: Setup, baseline: Setup, horizonYears: number, economics: SampleEconomics, running: RunningCosts): number {
  return paybackYear(
    { kit: components(option, economics), running: forSetup(running, option) },
    { kit: components(baseline, economics), running: forSetup(running, baseline) },
    horizonYears,
    economics.priceScenario,
  );
}

/**
 * The p-th quantile (0–1) of payback years, interpolated as `quantile` does (type 7). If the quantile falls on,
 * or between, samples one of which doesn't pay back, it is `DOES_NOT_PAY_BACK`: shown as "beyond lifetime".
 */
export function paybackQuantile(years: ArrayLike<number>, p: number): number {
  if (years.length === 0) throw new Error('Cannot take a quantile of no values');
  if (!(p >= 0 && p <= 1)) throw new Error(`Quantile must be between 0 and 1, got ${p}`);
  const sorted = Float64Array.from(years).toSorted();
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  const fraction = position - below;
  const low = sorted[below]!;
  if (fraction === 0) return low;
  const high = sorted[above]!;
  if (low === DOES_NOT_PAY_BACK || high === DOES_NOT_PAY_BACK) return DOES_NOT_PAY_BACK;
  return low + fraction * (high - low);
}

export interface PaybackSummary {
  /** The central run's payback year, or `DOES_NOT_PAY_BACK`. */
  central: number;
  /** The share of samples that pay back within their horizon. */
  sharePaysBack: number;
  p10: number;
  median: number;
  p90: number;
}

export function summarisePayback(years: ArrayLike<number>, central: number): PaybackSummary {
  if (years.length === 0) throw new Error('Cannot summarise the payback of zero samples');
  let paysBack = 0;
  for (let index = 0; index < years.length; index += 1) if (years[index]! !== DOES_NOT_PAY_BACK) paysBack += 1;
  return {
    central,
    sharePaysBack: paysBack / years.length,
    p10: paybackQuantile(years, 0.1),
    median: paybackQuantile(years, 0.5),
    p90: paybackQuantile(years, 0.9),
  };
}
