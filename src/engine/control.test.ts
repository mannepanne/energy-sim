// ABOUT: Tests for the control rules: preheat in cheap hours during or shortly before a heating period, coast in
// ABOUT: peak hours during one, nothing outside them, and no change at all without bands

import { describe, expect, it } from 'vitest';
import { HOURS_PER_YEAR } from './constants.ts';
import { checkControl, heatingTargets, type ControlSettings } from './control.ts';
import { CHEAP, PEAK } from './tariffs.ts';

const control: ControlSettings = { boostK: 1.5, preheatLeadHours: 3 };
const SETPOINT = 18;

/** Heating from 07:00 to 23:00 every day, by engine hour. */
const heatingOn = Uint8Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour % 24 >= 7 && hour % 24 < 23 ? 1 : 0));

/** A band with the given hours of the day cheap or peak, every day. */
function bandOf(cheap: readonly number[], peak: readonly number[]): Int8Array {
  return Int8Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (cheap.includes(hour % 24) ? CHEAP : peak.includes(hour % 24) ? PEAK : 0));
}

describe('heatingTargets', () => {
  it('holds the setpoint in heating periods and nothing outside them without bands or control', () => {
    for (const targets of [heatingTargets(heatingOn, SETPOINT), heatingTargets(heatingOn, SETPOINT, bandOf([3], [17])), heatingTargets(heatingOn, SETPOINT, undefined, control)]) {
      expect(targets[8]).toBe(SETPOINT);
      expect(targets[3]).toBeNaN();
    }
  });

  it('changes nothing with bands that mark no hour, as on the price cap', () => {
    expect(heatingTargets(heatingOn, SETPOINT, new Int8Array(HOURS_PER_YEAR), control)).toEqual(heatingTargets(heatingOn, SETPOINT));
  });

  it('preheats to setpoint + boost in cheap hours during a heating period or up to the lead time before one', () => {
    const targets = heatingTargets(heatingOn, SETPOINT, bandOf([2, 3, 4, 5, 6, 13, 23], []), control);
    // 04:00, 05:00 and 06:00 are within 3 hours of the 07:00 start; 02:00 and 03:00 are not.
    expect([targets[2], targets[3]]).toEqual([Number.NaN, Number.NaN]);
    expect([targets[4], targets[5], targets[6]]).toEqual([19.5, 19.5, 19.5]);
    expect(targets[13]).toBe(19.5);
    // 23:00 is cheap but eight hours before the next period.
    expect(targets[23]).toBeNaN();
  });

  it('coasts to setpoint − boost in peak hours during a heating period, and never heats in peak hours outside one', () => {
    const targets = heatingTargets(heatingOn, SETPOINT, bandOf([], [5, 17, 18]), control);
    expect([targets[17], targets[18]]).toEqual([16.5, 16.5]);
    expect(targets[5]).toBeNaN();
    const inPeriods = Array.from(targets).filter((_, hour) => heatingOn[hour]);
    expect(Math.min(...inPeriods)).toBe(SETPOINT - control.boostK);
  });

  it('looks ahead across the year end, so 31 December preheats for 1 January', () => {
    const lateStart = Uint8Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour === 1 ? 1 : 0));
    const lastHour = Int8Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour === HOURS_PER_YEAR - 1 ? CHEAP : 0));
    expect(heatingTargets(lateStart, SETPOINT, lastHour, control)[HOURS_PER_YEAR - 1]).toBe(19.5);
  });

  it('rejects arrays of the wrong length and settings out of range', () => {
    expect(() => heatingTargets(new Uint8Array(5), SETPOINT)).toThrow(/8760 hours/);
    expect(() => heatingTargets(heatingOn, SETPOINT, new Int8Array(5), control)).toThrow(/bands need 8760 hours/);
    expect(() => checkControl({ boostK: -1, preheatLeadHours: 3 })).toThrow(/boost must not be negative/);
    expect(() => checkControl({ boostK: 1, preheatLeadHours: 1.5 })).toThrow(/whole number of hours/);
  });
});
