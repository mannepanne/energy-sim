// ABOUT: Runs any of the 10 setup and tariff combinations on one set of inputs, keeping each one's annual totals
// ABOUT: Shares one run basis, so the heat side is computed once for the combinations that only differ in solar or tariff

import { partsOf, type ByCombination, type Combination } from './combinations.ts';
import type { EngineInputs } from './inputs.ts';
import { SETUP_KIT } from './setups.ts';
import { completeRun, heatSide, runBasis, type AnnualResult, type HeatSide } from './simulate.ts';
import { agileTariff, capTariff, cosyTariff, type AgileRates, type ElectricityTariff, type Tariff } from './tariffs.ts';
import type { PreparedWeather } from './weather.ts';

/** The electricity tariff for the inputs: the cap and Cosy from the register, Agile also from the snapshot's past year. */
export function tariffFor(tariff: Tariff, inputs: EngineInputs, agile: AgileRates | undefined): ElectricityTariff {
  if (tariff === 'cap') return capTariff(inputs);
  if (tariff === 'cosy') return cosyTariff(inputs);
  if (!agile) throw new Error('The agile tariff needs Agile\'s rates from the Octopus snapshot (agileFromSnapshot)');
  return agileTariff(inputs, agile);
}

/** Throws, before any run starts, if a combination needs Agile's rates and none were given. */
export function checkAgileGiven(combinations: readonly Combination[], agile: AgileRates | undefined): void {
  if (!agile && combinations.some((combination) => partsOf(combination).tariff === 'agile')) {
    throw new Error('The agile tariff needs Agile\'s rates from the Octopus snapshot (agileFromSnapshot)');
  }
}

/**
 * Runs the combinations on one set of inputs and keeps their annual totals. The heat side is computed once per
 * heating system and control choice, and each tariff, the roof's generation and k once for all, so 10
 * combinations take five thermal passes. Control applies to every heat pump combination; on the price cap it
 * changes nothing.
 */
export function runCombinations(
  inputs: EngineInputs,
  weather: PreparedWeather,
  combinations: readonly Combination[],
  agile?: AgileRates,
): ByCombination<AnnualResult> {
  checkAgileGiven(combinations, agile);
  const basis = runBasis(inputs, weather);
  const tariffs = new Map<Tariff, ElectricityTariff>();
  const sides = new Map<string, HeatSide>();
  const results: ByCombination<AnnualResult> = {};
  for (const combination of combinations) {
    const { setup, tariff: tariffName } = partsOf(combination);
    const { heating, solar } = SETUP_KIT[setup];
    let tariff = tariffs.get(tariffName);
    if (!tariff) {
      tariff = tariffFor(tariffName, inputs, agile);
      tariffs.set(tariffName, tariff);
    }
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
