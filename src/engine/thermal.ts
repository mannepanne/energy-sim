// ABOUT: One thermal-mass node, stepped hour by hour with backward Euler: C dT/dt = Q + G − H (T − T_out)
// ABOUT: Heats to the hour's setpoint, up to an output cap, during heating periods, and lets the house cool outside them

import { HOURS_PER_WEEK } from './calendar.ts';
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
 * pre-roll start temperature, so the year does not begin from an arbitrary state.
 */
export const PRE_ROLL_HOURS = HOURS_PER_WEEK;

/**
 * Runs the node over the year. Each hour's setpoint is in `setpointC`, or NaN when heating is off.
 * `outdoorC` and `gainsW` (solar plus internal) are hourly. One backward Euler step per hour:
 * the free temperature is T_free = (a T₀ + G + H T_out) ÷ (a + H), with a = C ÷ 1 h; in a heating period below
 * the setpoint, Q = (a + H)(T_set − T_free), capped, and T = T_free + Q ÷ (a + H).
 */
export function runThermalNode(
  node: ThermalNode,
  outdoorC: Float64Array,
  gainsW: Float64Array,
  setpointC: Float64Array,
  preRollStartC: number,
): ThermalYear {
  if (outdoorC.length !== HOURS_PER_YEAR || gainsW.length !== HOURS_PER_YEAR || setpointC.length !== HOURS_PER_YEAR) {
    throw new Error(`Weather, gains and setpoints must each have ${HOURS_PER_YEAR} hours`);
  }
  if (!(node.heatLossWPerK > 0) || !(node.heatCapacityWhPerK >= 0) || !(node.outputCapW >= 0)) {
    throw new Error('The thermal node needs H > 0, C ≥ 0 and an output cap ≥ 0');
  }
  const a = node.heatCapacityWhPerK;
  const h = node.heatLossWPerK;
  const conductance = a + h;
  const cap = node.outputCapW;

  let temperature = preRollStartC;
  for (let hour = HOURS_PER_YEAR - PRE_ROLL_HOURS; hour < HOURS_PER_YEAR; hour += 1) {
    temperature = step(temperature, hour);
  }
  const startTemperatureC = temperature;

  const spaceHeatKwh = new Float64Array(HOURS_PER_YEAR);
  const internalTemperatureC = new Float64Array(HOURS_PER_YEAR);
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const free = (a * temperature + gainsW[hour]! + h * outdoorC[hour]!) / conductance;
    const setpoint = setpointC[hour]!;
    let heatW = 0;
    if (free < setpoint) heatW = Math.min(conductance * (setpoint - free), cap);
    temperature = free + heatW / conductance;
    spaceHeatKwh[hour] = heatW / WH_PER_KWH;
    internalTemperatureC[hour] = temperature;
  }
  return { spaceHeatKwh, internalTemperatureC, startTemperatureC };

  function step(start: number, hour: number): number {
    const free = (a * start + gainsW[hour]! + h * outdoorC[hour]!) / conductance;
    const setpoint = setpointC[hour]!;
    return free < setpoint ? free + Math.min(conductance * (setpoint - free), cap) / conductance : free;
  }
}

/**
 * Each hour's setpoint from an hour-of-week schedule expanded to engine hours: the setpoint where the schedule is
 * 1 (a heating period), NaN where it is 0 (heating off).
 */
export function hourlySetpoints(scheduleByHour: Float64Array, setpointC: number): Float64Array {
  return scheduleByHour.map((on) => (on === 1 ? setpointC : Number.NaN));
}

/** Throws unless a heating schedule is 168 values, each 0 (off) or 1 (a heating period). */
export function checkSchedule(values: readonly number[], what: string): readonly number[] {
  if (values.length !== HOURS_PER_WEEK || values.some((value) => value !== 0 && value !== 1)) {
    throw new Error(`The ${what} schedule must be ${HOURS_PER_WEEK} values, each 0 (off) or 1 (heating)`);
  }
  return values;
}
