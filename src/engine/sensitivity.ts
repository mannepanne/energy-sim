// ABOUT: One-row-at-a-time sensitivity: each uncertain row or cell at its low and its high, every other at its default
// ABOUT: For each pair of setups, lists the rows either one's running cost reads, ranked by the swing in their cost difference

import type { RegisterAccessor } from '../register/access.ts';
import { defaultHouse, REFERENCE_ARCHETYPE, type House } from './archetypes.ts';
import { readInputs, uncertainDraws, type DrawKey, type UncertainDraw } from './inputs.ts';
import { forSetup, runningCostReads, SETUP_KIT, type BySetup, type Setup } from './setups.ts';
import { simulate } from './simulate.ts';
import type { PreparedWeather } from './weather.ts';

/** A setup compared with a baseline: another setup, or the same heating without solar. */
export interface SetupPair {
  setup: Setup;
  against: Setup;
}

/** Each setup against the reference, and solar against no solar on the heat pump (gas with solar is already against gas). */
export const SENSITIVITY_PAIRS: readonly SetupPair[] = [
  { setup: 'heatPump', against: 'gas' },
  { setup: 'gasSolar', against: 'gas' },
  { setup: 'heatPumpSolar', against: 'gas' },
  { setup: 'heatPumpSolar', against: 'heatPump' },
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

/** The running cost of each named setup with one value moved. */
function costsAt(access: RegisterAccessor, weather: PreparedWeather, house: House, id: DrawKey, value: number, setups: readonly Setup[]): BySetup<number> {
  const inputs = readInputs(access, { house, overrides: { [id]: value } });
  return Object.fromEntries(
    setups.map((setup) => {
      const { heating, solar } = SETUP_KIT[setup];
      return [setup, simulate(inputs, weather, heating, { solar }).annual.cost.totalPounds];
    }),
  );
}

function rowFor(draw: UncertainDraw, pair: SetupPair, low: BySetup<number>, high: BySetup<number>): SensitivityRow {
  const end = (value: number, costs: BySetup<number>): SensitivityEnd => {
    const costPounds = { setup: forSetup(costs, pair.setup), against: forSetup(costs, pair.against) };
    return { value, costPounds, costDifferencePounds: costPounds.against - costPounds.setup };
  };
  const [lowEnd, highEnd] = [end(draw.low, low), end(draw.high, high)];
  return { id: draw.id, label: draw.label, unit: draw.unit, low: lowEnd, high: highEnd, swingPounds: highEnd.costDifferencePounds - lowEnd.costDifferencePounds };
}

/**
 * One table per pair. A row is listed only if the running cost of either setup in the pair reads it, so capital
 * rows never appear, and neither do roof solar rows for a pair without solar. Correlations are ignored: each row
 * or cell moves alone. Each value is simulated once for all the setups the pairs need.
 */
export function sensitivity(
  access: RegisterAccessor,
  weather: PreparedWeather,
  pairs: readonly SetupPair[] = SENSITIVITY_PAIRS,
  house: House = defaultHouse(access, REFERENCE_ARCHETYPE),
): SensitivityTable[] {
  const tables: SensitivityTable[] = pairs.map((pair) => ({ pair, rows: [] }));
  for (const draw of uncertainDraws(access, house)) {
    const listing = tables.filter(({ pair }) => runningCostReads(pair.setup, draw.id) || runningCostReads(pair.against, draw.id));
    if (listing.length === 0) continue;
    const setups = [...new Set(listing.flatMap(({ pair }) => [pair.setup, pair.against]))];
    const low = costsAt(access, weather, house, draw.id, draw.low, setups);
    const high = costsAt(access, weather, house, draw.id, draw.high, setups);
    for (const table of listing) table.rows.push(rowFor(draw, table.pair, low, high));
  }
  return tables.map(({ pair, rows }) => ({ pair, rows: rows.toSorted(rank) }));
}
