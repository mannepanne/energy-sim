// ABOUT: The tariff grid: each setup on each electricity tariff it can use, 10 combinations, with gas always on the price cap
// ABOUT: Runs any of them on one set of inputs, sharing the heat side between combinations that only differ in solar or tariff

import type { DrawKey, EngineInputs } from './inputs.ts';
import { runningCostReads, SETUP_KIT, SETUPS, type Setup } from './setups.ts';
import { completeRun, heatSide, runBasis, capTariffOf, type AnnualResult, type Heating, type HeatSide } from './simulate.ts';
import { TARIFFS, type ElectricityTariff, type Tariff, type TimeOfUseTariffs } from './tariffs.ts';
import type { PreparedWeather } from './weather.ts';

/** Cosy is sold only to homes with a heat pump or electric heating, so the gas setups use the cap or Agile. */
export const TARIFFS_FOR: Readonly<Record<Heating, readonly Tariff[]>> = {
  gas: ['cap', 'agile'],
  heatPump: ['cap', 'cosy', 'agile'],
};

/**
 * The 10 combinations, setup by setup in the order of `SETUPS`, then tariff by tariff: a setup on an electricity
 * tariff it can use, such as "heatPump/cosy". A test checks the list against `TARIFFS_FOR`.
 */
export const COMBINATIONS = [
  'gas/cap',
  'gas/agile',
  'gasSolar/cap',
  'gasSolar/agile',
  'heatPump/cap',
  'heatPump/cosy',
  'heatPump/agile',
  'heatPumpSolar/cap',
  'heatPumpSolar/cosy',
  'heatPumpSolar/agile',
] as const;
export type Combination = (typeof COMBINATIONS)[number];

/** Every other combination is compared with replacing the boiler like for like, on the price cap. */
export const REFERENCE_COMBINATION = 'gas/cap' satisfies Combination;

/** The setups on the price cap, as phase 1 and the flat-tariff runs compare them. */
export const onCap = (setups: readonly Setup[]): Combination[] => setups.map((setup) => combinationOf(setup, 'cap'));

export function combinationOf(setup: Setup, tariff: Tariff): Combination {
  const found = COMBINATIONS.find((combination) => combination === `${setup}/${tariff}`);
  if (!found) throw new Error(`Setup "${setup}" cannot be on the ${tariff} tariff`);
  return found;
}

export interface CombinationParts {
  setup: Setup;
  tariff: Tariff;
}

/** The setup and tariff of a combination. Throws on a combination the grid doesn't have. */
export function partsOf(combination: Combination): CombinationParts {
  const [setupText, tariffText] = combination.split('/');
  const setup = SETUPS.find((name) => name === setupText);
  const tariff = TARIFFS.find((name) => name === tariffText);
  if (!setup || !tariff || !COMBINATIONS.includes(combination)) throw new Error(`"${combination}" is not a setup on a tariff it can use`);
  return { setup, tariff };
}

/** Combinations keyed by name, for those a run includes. */
export type ByCombination<T> = Partial<Record<Combination, T>>;

/** The entry for a combination, or an error naming it if the run left it out. */
export function forCombination<T>(record: ByCombination<T>, combination: Combination): T {
  const value = record[combination];
  if (value === undefined) throw new Error(`Combination "${combination}" is not in this run`);
  return value;
}

/** The uncertain values that only control reads: they move a heat pump's running cost only on a time-of-use tariff. */
const CONTROL_ROWS: ReadonlySet<DrawKey> = new Set<DrawKey>(['heating.controlBoost']);

/**
 * Whether an uncertain row or cell can change this combination's annual running cost: as `runningCostReads` for
 * its setup, except that the control rows matter only to a heat pump on a tariff with cheap and peak hours.
 */
export function combinationReads(combination: Combination, id: DrawKey): boolean {
  const { setup, tariff } = partsOf(combination);
  if (CONTROL_ROWS.has(id)) return SETUP_KIT[setup].heating === 'heatPump' && tariff !== 'cap';
  return runningCostReads(setup, id);
}

/** The electricity tariff object for a tariff name: the cap from the inputs, or Cosy or Agile as read. */
export function tariffFor(tariff: Tariff, inputs: EngineInputs, timeOfUse: TimeOfUseTariffs | undefined): ElectricityTariff {
  if (tariff === 'cap') return capTariffOf(inputs);
  if (!timeOfUse) throw new Error(`The ${tariff} tariff needs the time-of-use tariffs (readTimeOfUseTariffs)`);
  return timeOfUse[tariff];
}

/**
 * Runs the combinations on one set of inputs and keeps their annual totals. The heat side is computed once per
 * heating system and control choice, the roof's generation and k once for all, so 10 combinations take about
 * four thermal passes. Control applies to every heat pump combination; on the price cap it changes nothing.
 */
export function runCombinations(
  inputs: EngineInputs,
  weather: PreparedWeather,
  combinations: readonly Combination[],
  timeOfUse?: TimeOfUseTariffs,
): ByCombination<AnnualResult> {
  const basis = runBasis(inputs, weather);
  const sides = new Map<string, HeatSide>();
  const results: ByCombination<AnnualResult> = {};
  for (const combination of combinations) {
    const { setup, tariff: tariffName } = partsOf(combination);
    const { heating, solar } = SETUP_KIT[setup];
    const tariff = tariffFor(tariffName, inputs, timeOfUse);
    const key = heating === 'gas' || !tariff.hasBands ? heating : `${heating}|${tariffName}`;
    let side = sides.get(key);
    if (!side) {
      side = heatSide(basis, heating, tariff);
      sides.set(key, side);
    }
    results[combination] = completeRun(basis, side, tariff, solar).annual;
  }
  return results;
}
