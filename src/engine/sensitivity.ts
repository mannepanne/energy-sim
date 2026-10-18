// ABOUT: One-row-at-a-time sensitivity: each uncertain row at its low and its high, every other row at its default
// ABOUT: Ranked by how far the row moves the cost difference (gas minus heat pump), with ties broken by row id

import type { RegisterAccessor } from '../register/access.ts';
import { readInputs, UNCERTAIN_ROW_IDS, type HouseVariant, type UncertainRowId } from './inputs.ts';
import { simulate, type Setup } from './simulate.ts';
import type { PreparedWeather } from './weather.ts';

export interface SensitivityEnd {
  value: number;
  costPounds: Record<Setup, number>;
  /** Gas cost minus heat pump cost. */
  costDifferencePounds: number;
}

export interface SensitivityRow {
  id: UncertainRowId;
  label: string;
  unit: string;
  low: SensitivityEnd;
  high: SensitivityEnd;
  /** The cost difference at the high end minus at the low end. */
  swingPounds: number;
}

function end(access: RegisterAccessor, weather: PreparedWeather, variant: HouseVariant, id: UncertainRowId, value: number): SensitivityEnd {
  const inputs = readInputs(access, { variant, overrides: { [id]: value } });
  const gas = simulate(inputs, weather, 'gas').annual.cost.totalPounds;
  const heatPump = simulate(inputs, weather, 'heatPump').annual.cost.totalPounds;
  return { value, costPounds: { gas, heatPump }, costDifferencePounds: gas - heatPump };
}

/**
 * Swings closer than this (in pounds) count as equal when ranking, so floating-point noise never decides
 * the order. Base electricity use, for example, cancels out of the difference to about 1e-13.
 */
const SWING_TIE_POUNDS = 1e-6;

export function sensitivity(access: RegisterAccessor, weather: PreparedWeather, variant: HouseVariant = 'main'): SensitivityRow[] {
  const rows = UNCERTAIN_ROW_IDS.map((id): SensitivityRow => {
    const row = access.uncertain(id);
    const low = end(access, weather, variant, id, row.low);
    const high = end(access, weather, variant, id, row.high);
    return { id, label: row.label, unit: row.unit, low, high, swingPounds: high.costDifferencePounds - low.costDifferencePounds };
  });
  return rows.toSorted((a, b) => {
    const gap = Math.abs(b.swingPounds) - Math.abs(a.swingPounds);
    if (Math.abs(gap) > SWING_TIE_POUNDS) return gap;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
