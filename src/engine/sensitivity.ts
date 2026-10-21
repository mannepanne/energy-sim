// ABOUT: One-row-at-a-time sensitivity: each uncertain row or cell at its low and its high, every other at its default
// ABOUT: For each pair of combinations, lists the rows either one's running cost reads, ranked by the swing in their cost difference

import type { RegisterAccessor } from '../register/access.ts';
import { defaultHouse, REFERENCE_ARCHETYPE, type House } from './archetypes.ts';
import { combinationReads, forCombination, runCombinations, type ByCombination, type Combination } from './combinations.ts';
import { readInputs, uncertainDraws, type DrawKey, type UncertainDraw } from './inputs.ts';
import type { TimeOfUseTariffs } from './tariffs.ts';
import type { PreparedWeather } from './weather.ts';

/** A combination compared with a baseline: the reference, or the same heating and tariff without solar. */
export interface SetupPair {
  setup: Combination;
  against: Combination;
}

/**
 * On the price cap: each setup against the reference, and solar against no solar on the heat pump (gas with solar
 * is already against gas).
 */
export const SENSITIVITY_PAIRS: readonly SetupPair[] = [
  { setup: 'heatPump/cap', against: 'gas/cap' },
  { setup: 'gasSolar/cap', against: 'gas/cap' },
  { setup: 'heatPumpSolar/cap', against: 'gas/cap' },
  { setup: 'heatPumpSolar/cap', against: 'heatPump/cap' },
];

export interface SensitivityEnd {
  value: number;
  costPounds: Record<'setup' | 'against', number>;
  /** The baseline's cost minus the setup's: positive means the setup is cheaper to run. */
  costDifferencePounds: number;
}

export interface SensitivityRow {
  id: DrawKey;
  label: string;
  unit: string;
  low: SensitivityEnd;
  high: SensitivityEnd;
  /** The cost difference at the high end minus at the low end. */
  swingPounds: number;
}

export interface SensitivityTable {
  pair: SetupPair;
  rows: SensitivityRow[];
}

/**
 * Swings closer than this (in pounds) count as equal when ranking, so floating-point noise never decides
 * the order. Base electricity use, for example, cancels out of the difference to about 1e-13.
 */
const SWING_TIE_POUNDS = 1e-6;

const rank = (a: SensitivityRow, b: SensitivityRow): number => {
  const gap = Math.abs(b.swingPounds) - Math.abs(a.swingPounds);
  if (Math.abs(gap) > SWING_TIE_POUNDS) return gap;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** What the sensitivity tables need besides the register and the weather. */
export interface SensitivityOptions {
  house?: House;
  /** Cosy and Agile, needed when a pair uses either. */
  timeOfUse?: TimeOfUseTariffs;
}

/** The running cost of each named combination with one value moved. */
function costsAt(
  access: RegisterAccessor,
  weather: PreparedWeather,
  house: House,
  timeOfUse: TimeOfUseTariffs | undefined,
  id: DrawKey,
  value: number,
  combinations: readonly Combination[],
): ByCombination<number> {
  const annual = runCombinations(readInputs(access, { house, overrides: { [id]: value } }), weather, combinations, timeOfUse);
  return Object.fromEntries(combinations.map((combination) => [combination, forCombination(annual, combination).cost.totalPounds]));
}

function rowFor(draw: UncertainDraw, pair: SetupPair, low: ByCombination<number>, high: ByCombination<number>): SensitivityRow {
  const end = (value: number, costs: ByCombination<number>): SensitivityEnd => {
    const costPounds = { setup: forCombination(costs, pair.setup), against: forCombination(costs, pair.against) };
    return { value, costPounds, costDifferencePounds: costPounds.against - costPounds.setup };
  };
  const [lowEnd, highEnd] = [end(draw.low, low), end(draw.high, high)];
  return { id: draw.id, label: draw.label, unit: draw.unit, low: lowEnd, high: highEnd, swingPounds: highEnd.costDifferencePounds - lowEnd.costDifferencePounds };
}

/**
 * One table per pair. A row is listed only if the running cost of either combination in the pair reads it, so
 * capital rows never appear, and neither do roof solar rows for a pair without solar or control rows for a pair on
 * the price cap. Correlations are ignored: each row or cell moves alone. Each value is simulated once for all the
 * combinations the pairs need.
 */
export function sensitivity(
  access: RegisterAccessor,
  weather: PreparedWeather,
  pairs: readonly SetupPair[] = SENSITIVITY_PAIRS,
  options: SensitivityOptions = {},
): SensitivityTable[] {
  const house = options.house ?? defaultHouse(access, REFERENCE_ARCHETYPE);
  const tables: SensitivityTable[] = pairs.map((pair) => ({ pair, rows: [] }));
  for (const draw of uncertainDraws(access, house)) {
    const listing = tables.filter(({ pair }) => combinationReads(pair.setup, draw.id) || combinationReads(pair.against, draw.id));
    if (listing.length === 0) continue;
    const combinations = [...new Set(listing.flatMap(({ pair }) => [pair.setup, pair.against]))];
    const low = costsAt(access, weather, house, options.timeOfUse, draw.id, draw.low, combinations);
    const high = costsAt(access, weather, house, options.timeOfUse, draw.id, draw.high, combinations);
    for (const table of listing) table.rows.push(rowFor(draw, table.pair, low, high));
  }
  return tables.map(({ pair, rows }) => ({ pair, rows: rows.toSorted(rank) }));
}
