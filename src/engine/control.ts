// ABOUT: The published control rules: the heat pump's target temperature each hour from its schedule and the tariff's bands
// ABOUT: Preheat in cheap hours during or shortly before a heating period, coast in peak hours; no band, no change

import { HOURS_PER_YEAR } from './constants.ts';
import { CHEAP, PEAK } from './tariffs.ts';

export interface ControlSettings {
  /** The setpoint rises by this in preheat hours and falls by it in coast hours, K. Setpoint + boost is the comfort cap. */
  boostK: number;
  /** Preheat may start this many hours before a heating period. */
  preheatLeadHours: number;
}

export function checkControl(control: ControlSettings): void {
  if (!(control.boostK >= 0)) throw new Error(`The control boost must not be negative, got ${control.boostK} K`);
  if (!(Number.isInteger(control.preheatLeadHours) && control.preheatLeadHours >= 0)) {
    throw new Error(`The preheat lead time must be a whole number of hours from 0, got ${control.preheatLeadHours}`);
  }
}

/**
 * The temperature the heating holds in each engine hour, or NaN when heating is off. Without bands (no control, or
 * the price cap), it is the setpoint in heating periods and off outside them. With bands:
 * - preheat: in a cheap hour during a heating period, or up to the lead time before one, the target is setpoint + boost;
 * - coast: in a peak hour during a heating period, the target is setpoint − boost;
 * - any other hour keeps the schedule.
 * The year wraps, so the last hours of December look ahead to 1 January, as the thermal node's pre-roll does.
 */
export function heatingTargets(heatingOn: ArrayLike<number>, setpointC: number, band?: Int8Array, control?: ControlSettings): Float64Array {
  if (heatingOn.length !== HOURS_PER_YEAR) throw new Error(`Heating hours need ${HOURS_PER_YEAR} hours, got ${heatingOn.length}`);
  const targets = new Float64Array(HOURS_PER_YEAR);
  if (!band || !control) {
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) targets[hour] = heatingOn[hour]! > 0 ? setpointC : Number.NaN;
    return targets;
  }
  if (band.length !== HOURS_PER_YEAR) throw new Error(`Tariff bands need ${HOURS_PER_YEAR} hours, got ${band.length}`);
  checkControl(control);
  // Walk backwards over two years so each hour knows how far ahead the next heating hour starts, across the year end.
  let hoursToNextHeating = Number.POSITIVE_INFINITY;
  for (let step = 2 * HOURS_PER_YEAR - 1; step >= 0; step -= 1) {
    const hour = step % HOURS_PER_YEAR;
    const heating = heatingOn[hour]! > 0;
    if (step < HOURS_PER_YEAR) {
      let target = heating ? setpointC : Number.NaN;
      if (band[hour] === CHEAP && (heating || hoursToNextHeating <= control.preheatLeadHours)) target = setpointC + control.boostK;
      else if (band[hour] === PEAK && heating) target = setpointC - control.boostK;
      targets[hour] = target;
    }
    hoursToNextHeating = heating ? 1 : hoursToNextHeating + 1;
  }
  return targets;
}
