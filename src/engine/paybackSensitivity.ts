// ABOUT: One-row-at-a-time payback sensitivity: each capital cost, lifetime and price change at its low and its high
// ABOUT: For each pair of combinations, the central payback year at both ends, ranked by how much the first pair's payback moves

import type { RegisterAccessor } from '../register/access.ts';
import { defaultHouse, REFERENCE_ARCHETYPE, type House } from './archetypes.ts';
import { combinationOf, partsOf, REFERENCE_COMBINATION } from './combinations.ts';
import { economicsOf } from './compare.ts';
import { readInputs, uncertainDraws, type DrawKey } from './inputs.ts';
import {
  CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN,
  DOES_NOT_PAY_BACK,
  horizonAgainstReference,
  samplePayback,
  solarHorizon,
  type RunningCosts,
  type SampleEconomics,
} from './payback.ts';
import type { CombinationPair } from './sensitivity.ts';
import { CAPITAL_ROWS, SETUP_KIT, setupOf } from './setups.ts';

/**
 * The heat pump on the cap against the reference first, as the table is ranked by it. Then solar on each heating
 * system against the reference, the heat pump on Cosy and on Agile, and solar's own payback on the heat pump.
 */
export const PAYBACK_SENSITIVITY_PAIRS: readonly CombinationPair[] = [
  { option: 'heatPump/cap', against: 'gas/cap' },
  { option: 'heatPumpSolar/cap', against: 'gas/cap' },
  { option: 'gasSolar/cap', against: 'gas/cap' },
  { option: 'heatPump/cosy', against: 'gas/cap' },
  { option: 'heatPump/agile', against: 'gas/cap' },
  { option: 'heatPumpSolar/cap', against: 'heatPump/cap' },
];

/**
 * The horizon for a pair: as against the reference for a pair against it, and PV's lifetime for solar against the
 * same heating and tariff without solar. Throws on any other pair.
 */
export function pairHorizon({ option, against }: CombinationPair, economics: SampleEconomics): number {
  if (against === REFERENCE_COMBINATION) return horizonAgainstReference(option, economics.capital);
  const { setup, tariff } = partsOf(option);
  const { heating, solar } = SETUP_KIT[setup];
  if (solar && combinationOf(setupOf(heating, false), tariff) === against) return solarHorizon(economics.capital);
  throw new Error(`No payback horizon for "${option}" against "${against}": compare with the reference or with no solar`);
}

export interface PaybackEnd {
  value: number;
  /** One year per pair, in the order of the pairs: a year, `DOES_NOT_PAY_BACK` or `CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN`. */
  years: number[];
  /** The horizon each pair's payback is measured over at this end, as lifetimes move it. */
  horizons: number[];
}

export interface PaybackSensitivityRow {
  id: DrawKey;
  label: string;
  unit: string;
  low: PaybackEnd;
  high: PaybackEnd;
  /** How far the first pair's payback moves between the ends, in years, by `rankingYears`. */
  swingYears: number;
}

export interface PaybackSensitivity {
  pairs: readonly CombinationPair[];
  /** The payback year of each pair with every row at its default. */
  central: number[];
  rows: PaybackSensitivityRow[];
}

/**
 * A payback year as a number to rank by: "doesn't pay back" counts as the horizon, the latest it could be, and "cheaper
 * up front, costs more to run" as 0, since there is nothing to pay back.
 */
export function rankingYears(year: number, horizonYears: number): number {
  if (year === DOES_NOT_PAY_BACK) return horizonYears;
  if (year === CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN) return 0;
  return year;
}

function paybackOf(pairs: readonly CombinationPair[], economics: SampleEconomics, running: RunningCosts): Omit<PaybackEnd, 'value'> {
  const horizons = pairs.map((pair) => pairHorizon(pair, economics));
  return { horizons, years: pairs.map((pair, index) => samplePayback(pair.option, pair.against, horizons[index]!, economics, running)) };
}

/**
 * One row for each capital cost, lifetime and price change the house reads, each at its low and its high with every
 * other row at its default. These rows never change a year's running cost, so the central running costs serve every
 * end and nothing is simulated again. Correlations are ignored: a price change moves alone, without the other.
 * Ranked by the first pair's swing, largest first; equal swings by row id.
 */
export function paybackSensitivity(
  access: RegisterAccessor,
  running: RunningCosts,
  pairs: readonly CombinationPair[] = PAYBACK_SENSITIVITY_PAIRS,
  house: House = defaultHouse(access, REFERENCE_ARCHETYPE),
): PaybackSensitivity {
  if (pairs.length === 0) throw new Error('A payback sensitivity needs at least one pair');
  const central = paybackOf(pairs, economicsOf(readInputs(access, { house })), running).years;
  const rows = uncertainDraws(access, house)
    .filter((draw) => CAPITAL_ROWS.has(draw.id))
    .map((draw): PaybackSensitivityRow => {
      const at = (value: number): PaybackEnd => ({ value, ...paybackOf(pairs, economicsOf(readInputs(access, { house, overrides: { [draw.id]: value } })), running) });
      const [low, high] = [at(draw.low), at(draw.high)];
      const swingYears = Math.abs(rankingYears(high.years[0]!, high.horizons[0]!) - rankingYears(low.years[0]!, low.horizons[0]!));
      return { id: draw.id, label: draw.label, unit: draw.unit, low, high, swingYears };
    });
  return { pairs, central, rows: rows.toSorted((a, b) => b.swingYears - a.swingYears || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
}
