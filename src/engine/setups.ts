// ABOUT: The four setups v1 compares: a gas boiler or a heat pump, each with or without roof solar
// ABOUT: Names each setup's heating and solar, the reference setup, and which uncertain values its running cost reads

import { SCENARIO_ROWS, type DrawKey, type UncertainRowId } from './inputs.ts';
import type { Heating } from './simulate.ts';

export const SETUPS = ['gas', 'gasSolar', 'heatPump', 'heatPumpSolar'] as const;
export type Setup = (typeof SETUPS)[number];

/** Every other setup is compared with replacing the boiler like for like. */
export const REFERENCE_SETUP = 'gas' satisfies Setup;

export interface SetupKit {
  heating: Heating;
  solar: boolean;
}

export const SETUP_KIT: Readonly<Record<Setup, SetupKit>> = {
  gas: { heating: 'gas', solar: false },
  gasSolar: { heating: 'gas', solar: true },
  heatPump: { heating: 'heatPump', solar: false },
  heatPumpSolar: { heating: 'heatPump', solar: true },
};

/** The setup with the given heating and solar. */
export function setupOf(heating: Heating, solar: boolean): Setup {
  if (heating === 'gas') return solar ? 'gasSolar' : 'gas';
  return solar ? 'heatPumpSolar' : 'heatPump';
}

/** Setups keyed by name, for those a run includes. */
export type BySetup<T> = Partial<Record<Setup, T>>;

/** The entry for a setup, or an error naming the setup if the run left it out. */
export function forSetup<T>(record: BySetup<T>, setup: Setup): T {
  const value = record[setup];
  if (value === undefined) throw new Error(`Setup "${setup}" is not in this run`);
  return value;
}

const HEAT_PUMP_ROWS: ReadonlySet<DrawKey> = new Set<UncertainRowId>([
  ...Object.values(SCENARIO_ROWS).flatMap((rows) => Object.values(rows)),
  'heating.flowTemperatureAtDesign',
  'heating.flowTemperatureAtMild',
]);
const BOILER_ROWS: ReadonlySet<DrawKey> = new Set<UncertainRowId>(['heating.boilerSeasonalEfficiency']);
const SOLAR_ROWS: ReadonlySet<DrawKey> = new Set<UncertainRowId>(['solar.systemSize', 'solar.azimuth', 'solar.usableRoofFraction']);

/** Costs, lifetimes and price changes: payback reads them, but they never change a year's running cost. */
export const CAPITAL_ROWS: ReadonlySet<DrawKey> = new Set<UncertainRowId>([
  'prices.gasRealChange',
  'prices.electricityRealChange',
  'costs.boilerInstalled',
  'costs.heatPumpInstalled',
  'costs.pvPerKwp',
  'costs.heatPumpLifetime',
  'costs.boilerLifetime',
  'costs.pvLifetime',
]);

/**
 * Whether an uncertain row or cell can change this setup's annual running cost. Every setup reads every row, so
 * draws pair; this says which ones matter. The heat pump's rows matter only to heat pump setups, the boiler's
 * efficiency only to gas setups, the roof solar rows only to solar setups, and capital rows to none. Every other
 * row (fabric, gains, hot water, base use) matters to all four. A test checks each exclusion moves nothing.
 */
export function runningCostReads(setup: Setup, id: DrawKey): boolean {
  const { heating, solar } = SETUP_KIT[setup];
  if (CAPITAL_ROWS.has(id)) return false;
  if (HEAT_PUMP_ROWS.has(id)) return heating === 'heatPump';
  if (BOILER_ROWS.has(id)) return heating === 'gas';
  if (SOLAR_ROWS.has(id)) return solar;
  return true;
}
