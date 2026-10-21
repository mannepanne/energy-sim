// ABOUT: One thermal-mass node, stepped hour by hour with backward Euler: C dT/dt = Q + G − H (T − T_out)
// ABOUT: Heats to each hour's target temperature, up to an output cap, and lets the house cool in hours with no target

import { expandWeekly, HOURS_PER_WEEK, type Calendar } from './calendar.ts';
import { HOURS_PER_YEAR, WH_PER_KWH } from './constants.ts';

export interface ThermalNode {
  /** H, W/K. */
  heatLossWPerK: number;
  /** C, Wh/K. Zero gives no thermal mass: the house reaches the setpoint in every heated hour. */
  heatCapacityWhPerK: number;
  /** The most heat the system delivers in an hour, W. `Infinity` for no cap. */
  outputCapW: number;
}

export interface ThermalYear {
  spaceHeatKwh: Float64Array;
  /** The node's temperature at the end of each hour. */
  internalTemperatureC: Float64Array;
  /** The node's temperature at the start of hour 0, after the pre-roll. */
  startTemperatureC: number;
}

/**
 * The node starts each year from the temperature it reaches over the year's last week, run first from the
 * setpoint, so the year does not begin from an arbitrary state.
 */
export const PRE_ROLL_HOURS = HOURS_PER_WEEK;

/**
 * Runs the node over the year. `targetC` is the temperature the heating holds in each hour, or NaN when heating is
 * off; the pre-roll starts at `startC`. `outdoorC` and `gainsW` (solar plus internal) are hourly. One backward Euler
 * step per hour: the free temperature is T_free = (a T₀ + G + H T_out) ÷ (a + H), with a = C ÷ 1 h; below the
 * hour's target, Q = (a + H)(T_target − T_free), capped, and T = T_free + Q ÷ (a + H).
 */
export function runThermalNode(
  node: ThermalNode,
  outdoorC: Float64Array,
  gainsW: Float64Array,
  targetC: Float64Array,
  startC: number,
): ThermalYear {
  if (outdoorC.length !== HOURS_PER_YEAR || gainsW.length !== HOURS_PER_YEAR || targetC.length !== HOURS_PER_YEAR) {
    throw new Error(`Weather, gains and heating targets must each have ${HOURS_PER_YEAR} hours`);
  }
  if (!(node.heatLossWPerK > 0) || !(node.heatCapacityWhPerK >= 0) || !(node.outputCapW >= 0)) {
    throw new Error('The thermal node needs H > 0, C ≥ 0 and an output cap ≥ 0');
  }
  const a = node.heatCapacityWhPerK;
  const h = node.heatLossWPerK;
  const conductance = a + h;
  const cap = node.outputCapW;

  const spaceHeatKwh = new Float64Array(HOURS_PER_YEAR);
  const internalTemperatureC = new Float64Array(HOURS_PER_YEAR);
  let temperature = startC;
  let startTemperatureC = startC;
  // Steps below 0 are the pre-roll, over the year's last week; only steps from 0 are recorded.
  for (let step = -PRE_ROLL_HOURS; step < HOURS_PER_YEAR; step += 1) {
    if (step === 0) startTemperatureC = temperature;
    const hour = step < 0 ? step + HOURS_PER_YEAR : step;
    const free = (a * temperature + gainsW[hour]! + h * outdoorC[hour]!) / conductance;
    const target = targetC[hour]!;
    // A NaN target (heating off) fails the comparison, so no heat is supplied.
    const heatW = free < target ? Math.min(conductance * (target - free), cap) : 0;
    temperature = free + heatW / conductance;
    if (step >= 0) {
      spaceHeatKwh[hour] = heatW / WH_PER_KWH;
      internalTemperatureC[hour] = temperature;
    }
  }
  return { spaceHeatKwh, internalTemperatureC, startTemperatureC };
}

const expandedSchedules = new WeakMap<Calendar, WeakMap<readonly number[], Uint8Array>>();

/**
 * A heating schedule (168 values, Monday 00:00 local first) as 1 or 0 for every engine hour. Schedules come from
 * the register and are read once, so each is expanded once per calendar and kept.
 */
export function heatingHours(schedule: readonly number[], calendar: Calendar): Uint8Array {
  let forCalendar = expandedSchedules.get(calendar);
  if (!forCalendar) {
    forCalendar = new WeakMap();
    expandedSchedules.set(calendar, forCalendar);
  }
  let hours = forCalendar.get(schedule);
  if (!hours) {
    hours = Uint8Array.from(expandWeekly(schedule, calendar));
    forCalendar.set(schedule, hours);
  }
  return hours;
}

/** Throws unless a heating schedule is 168 values, each 0 (off) or 1 (a heating period). */
export function checkSchedule(values: readonly number[], what: string): readonly number[] {
  if (values.length !== HOURS_PER_WEEK || values.some((value) => value !== 0 && value !== 1)) {
    throw new Error(`The ${what} schedule must be ${HOURS_PER_WEEK} values, each 0 (off) or 1 (heating)`);
  }
  return values;
}
