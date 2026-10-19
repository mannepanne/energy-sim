// ABOUT: Supply: gas for each hour's heat, the boiler's pump and fan electricity, and base electricity by hour
// ABOUT: Gas = heat ÷ boiler seasonal efficiency, with unlimited capacity; the heat pump's electricity is in heatPump.ts

import { expandMonthly, expandWeekly, type Calendar } from './calendar.ts';
import type { EngineInputs } from './inputs.ts';

/** Divides each hour's heat by a seasonal efficiency. */
export function fuelForHeat(heatKwh: Float64Array, efficiency: number): Float64Array {
  if (!(efficiency > 0)) throw new Error(`A seasonal efficiency must be positive, got ${efficiency}`);
  return heatKwh.map((heat) => heat / efficiency);
}

/**
 * Cost of one kWh of delivered heat, in pence: the unit rate divided by the seasonal efficiency.
 * Not used by `simulate`; it holds the spec's worked price check (costCarbon.test.ts).
 */
export function pencePerKwhOfHeat(unitRatePence: number, efficiency: number): number {
  if (!(efficiency > 0)) throw new Error(`A seasonal efficiency must be positive, got ${efficiency}`);
  return unitRatePence / efficiency;
}

/** The boiler's annual pump and fan electricity, spread over the year in proportion to each hour's gas use. */
export function auxiliaryElectricity(gasKwh: Float64Array, kwhPerYear: number): Float64Array {
  if (!(kwhPerYear >= 0)) throw new Error(`Auxiliary electricity must not be negative, got ${kwhPerYear} kWh a year`);
  const totalGas = gasKwh.reduce((total, value) => total + value, 0);
  if (totalGas === 0) return new Float64Array(gasKwh.length);
  return gasKwh.map((gas) => (gas / totalGas) * kwhPerYear);
}

/**
 * Base electricity (lights and appliances) in each engine hour: the weekly shape × the month level, by local time,
 * rescaled over the year's 8,760 engine hours so the year's total equals the base use row exactly.
 */
export function baseElectricityKwh(
  inputs: Pick<EngineInputs, 'baseElectricityKwhPerYear' | 'baseElectricityWeeklyProfile' | 'baseElectricityMonthlyProfile'>,
  calendar: Calendar,
): Float64Array {
  const weekly = expandWeekly(inputs.baseElectricityWeeklyProfile, calendar);
  const monthly = expandMonthly(inputs.baseElectricityMonthlyProfile, calendar);
  const shape = weekly.map((value, hour) => value * monthly[hour]!);
  const total = shape.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new Error('The base electricity profile is zero in every hour');
  return shape.map((value) => (value / total) * inputs.baseElectricityKwhPerYear);
}
