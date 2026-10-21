// ABOUT: Physics checks on the thermal-mass node: the no-mass limit, free decay, the energy balance and the output cap
// ABOUT: Also the schedule helpers, and that every archetype's time constant is long enough for an hourly step

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { ARCHETYPE_KEYS, defaultHouse } from './archetypes.ts';
import { buildCalendar } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { totalGainsW } from './demand.ts';
import { heatLoss } from './geometry.ts';
import { readInputs } from './inputs.ts';
import { checkSchedule, heatingHours, PRE_ROLL_HOURS, runThermalNode, type ThermalNode, type ThermalYear } from './thermal.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';
import { heatingTargets } from './control.ts';

/** The node on a heating schedule at one setpoint, starting the pre-roll at the setpoint. */
const runNode = (node: Parameters<typeof runThermalNode>[0], outdoorC: Float64Array, gainsW: Float64Array, heatingOn: ArrayLike<number>, setpointC: number) =>
  runThermalNode(node, outdoorC, gainsW, heatingTargets(heatingOn, setpointC), setpointC);

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = createAccessor(loadRegister(readJson('../../data/register.json')));
const weather = weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')));

const constant = (value: number): Float64Array => new Float64Array(HOURS_PER_YEAR).fill(value);
const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);
/** Heating on in every hour. */
const ALWAYS = new Uint8Array(HOURS_PER_YEAR).fill(1);

/** The 1930s semi at its defaults on the PVGIS year: H, C, outdoor temperature and gains. */
const semi = readInputs(access);
const prepared = prepareWeather(weather, semi);
const semiH = heatLoss(semi).totalWPerK;
const semiGains = totalGainsW(semi, prepared.meanVerticalIrradiance);
const semiNode: ThermalNode = { heatLossWPerK: semiH, heatCapacityWhPerK: semi.heatCapacityWhPerK, outputCapW: Infinity };

/** Phase 1's continuous method: max(0, H (T_set − T_out) − G) each hour. */
const phase1SpaceHeatKwh = (setpointC: number): number =>
  sum(prepared.outdoorTemperatureC.map((outdoor, hour) => Math.max(0, semiH * (setpointC - outdoor) - semiGains[hour]!) / 1000));

/** How much full C lowers continuous heating against phase 1's method, as a share. */
const continuousReduction = (setpoint: number): number =>
  1 - sum(runNode(semiNode, prepared.outdoorTemperatureC, semiGains, ALWAYS, setpoint).spaceHeatKwh) / phase1SpaceHeatKwh(setpoint);

/**
 * Free decay from 20 °C towards 0 °C outdoors at a given time constant, with no gains. The pre-roll (the year's last
 * week) heats the node to 20 °C at 20 °C outdoors; heating is off from hour 0. Returns the year and the largest gap
 * from the exact exponential over ten time constants, as a share of the initial difference.
 */
function decay(timeConstantHours: number): { year: ThermalYear; largestError: number } {
  const heatLossWPerK = 100;
  const node = { heatLossWPerK, heatCapacityWhPerK: timeConstantHours * heatLossWPerK, outputCapW: Infinity };
  const outdoor = constant(0);
  const heating = new Uint8Array(HOURS_PER_YEAR);
  for (let hour = HOURS_PER_YEAR - PRE_ROLL_HOURS; hour < HOURS_PER_YEAR; hour += 1) {
    outdoor[hour] = 20;
    heating[hour] = 1;
  }
  const year = runNode(node, outdoor, constant(0), heating, 20);
  let largestError = 0;
  for (let hour = 0; hour < 10 * timeConstantHours; hour += 1) {
    const exact = 20 * Math.exp(-(hour + 1) / timeConstantHours);
    largestError = Math.max(largestError, Math.abs(year.internalTemperatureC[hour]! - exact) / 20);
  }
  return { year, largestError };
}

describe('the no-mass limit and continuous heating', () => {
  it('with C = 0 reproduces phase 1’s continuous method exactly (within 0.5%)', () => {
    const year = runNode({ ...semiNode, heatCapacityWhPerK: 0 }, prepared.outdoorTemperatureC, semiGains, ALWAYS, 19);
    const phase1 = phase1SpaceHeatKwh(19);
    expect(sum(year.spaceHeatKwh) / phase1 - 1).toBeCloseTo(0, 12);
  });

  it('with full C lowers continuous heating, by storing daytime surplus: by 11.4%, 8.0% and 5.5% at 16, 19 and 21 °C', () => {
    // The one node holds its mass at the air temperature, so it stores surplus more readily than a real house
    // (8.4% below HEM's continuous run with the same mass; see scripts/benchmark/hem/README.md).
    // The spec expected under 5%; the gap is larger at lower setpoints, where more hours float above the setpoint.
    expect(continuousReduction(16)).toBeCloseTo(0.114, 3);
    expect(continuousReduction(19)).toBeCloseTo(0.08, 3);
    expect(continuousReduction(21)).toBeCloseTo(0.055, 3);
  });
});

describe('free decay with the heating off', () => {
  it.each([10, 20, 50])('decays towards outdoor within 2% of the exact exponential at a %i-hour time constant', (timeConstant) => {
    const { year, largestError } = decay(timeConstant);
    // The error is measured as a share of the initial difference: about 1.8% at 10 hours, and smaller above.
    expect(largestError).toBeLessThan(0.02);
    expect(year.startTemperatureC).toBeCloseTo(20, 12);
    expect(sum(year.spaceHeatKwh.subarray(0, HOURS_PER_YEAR - PRE_ROLL_HOURS))).toBe(0);
    // One backward Euler step: T₁ = T₀ ÷ (1 + 1 h ÷ τ).
    expect(year.internalTemperatureC[0]).toBeCloseTo(20 / (1 + 1 / timeConstant), 9);
  });

  it('is about 1.8% at 10 hours, the shortest time constant it is used at', () => {
    expect(decay(10).largestError).toBeCloseTo(0.0176, 3);
  });

  it('gives every archetype a time constant C ÷ H of at least 10 hours, at its defaults', () => {
    const timeConstants = ARCHETYPE_KEYS.map((archetype) => {
      const inputs = readInputs(access, { house: defaultHouse(access, archetype) });
      return inputs.heatCapacityWhPerK / heatLoss(inputs).totalWPerK;
    });
    expect(Math.min(...timeConstants)).toBeGreaterThanOrEqual(10);
  });
});

describe('a scheduled year on the PVGIS weather', () => {
  // SAP's weekday pattern every day, at 20 °C, on GMT, enough to exercise warm-up, cooling and free-floating.
  const hours = new Set([7, 8, 16, 17, 18, 19, 20, 21, 22]);
  const heating = Uint8Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hours.has(hour % 24) ? 1 : 0));
  const capW = 6000;
  const year = runNode({ ...semiNode, outputCapW: capW }, prepared.outdoorTemperatureC, semiGains, heating, 20);

  it('closes the energy balance every hour and over the year: Q + G − H (T − T_out) = C (T − T_before)', () => {
    let before = year.startTemperatureC;
    let largestHourlyError = 0;
    let storedWh = 0;
    let netWh = 0;
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const temperature = year.internalTemperatureC[hour]!;
      const inflowWh = year.spaceHeatKwh[hour]! * 1000 + semiGains[hour]! - semiH * (temperature - prepared.outdoorTemperatureC[hour]!);
      const storedThisHourWh = semi.heatCapacityWhPerK * (temperature - before);
      largestHourlyError = Math.max(largestHourlyError, Math.abs(inflowWh - storedThisHourWh));
      storedWh += storedThisHourWh;
      netWh += inflowWh;
      before = temperature;
    }
    expect(largestHourlyError).toBeLessThan(1e-6);
    expect(netWh - storedWh).toBeCloseTo(0, 3);
    expect(storedWh).toBeCloseTo(semi.heatCapacityWhPerK * (before - year.startTemperatureC), 3);
  });

  it('never exceeds the output cap, and reaches the setpoint in every heated hour where the cap does not bind', () => {
    const heatW = Array.from(year.spaceHeatKwh, (kwh) => kwh * 1000);
    expect(Math.max(...heatW)).toBeLessThanOrEqual(capW + 1e-9);
    const capped = heatW.filter((watts) => watts >= capW - 1e-9).length;
    const belowSetpoint = heatW.filter((watts, hour) => watts > 0 && watts < capW - 1e-9 && Math.abs(year.internalTemperatureC[hour]! - 20) > 1e-9);
    expect(capped).toBeGreaterThan(0);
    expect(belowSetpoint).toEqual([]);
  });

  it('heats only in heating periods, and lets the house float above the setpoint on warm days', () => {
    const offHours = year.spaceHeatKwh.filter((_, hour) => heating[hour] === 0);
    expect(sum(offHours)).toBe(0);
    expect(Math.max(...year.internalTemperatureC)).toBeGreaterThan(24);
  });

  it('uses less heat with a lower cap, since the house is then colder after each off period', () => {
    const lowCap = runNode({ ...semiNode, outputCapW: 3000 }, prepared.outdoorTemperatureC, semiGains, heating, 20);
    expect(sum(lowCap.spaceHeatKwh)).toBeLessThan(sum(year.spaceHeatKwh));
  });

  it('uses more heat than with no mass, which reaches the setpoint at once and loses nothing while off', () => {
    const noMass = runNode({ ...semiNode, heatCapacityWhPerK: 0, outputCapW: capW }, prepared.outdoorTemperatureC, semiGains, heating, 20);
    expect(sum(year.spaceHeatKwh)).toBeGreaterThan(sum(noMass.spaceHeatKwh));
  });
});

describe('input checks and schedule helpers', () => {
  it('rejects series of the wrong length and an invalid node', () => {
    const short = new Float64Array(24);
    expect(() => runNode(semiNode, short, constant(0), ALWAYS, 20)).toThrow('8760 hours');
    expect(() => runNode(semiNode, constant(0), short, ALWAYS, 20)).toThrow('8760 hours');
    expect(() => runNode(semiNode, constant(0), constant(0), short, 20)).toThrow('8760 hours');
    expect(() => runNode({ ...semiNode, heatLossWPerK: 0 }, constant(0), constant(0), ALWAYS, 20)).toThrow('H > 0');
    expect(() => runNode({ ...semiNode, heatCapacityWhPerK: -1 }, constant(0), constant(0), ALWAYS, 20)).toThrow('C ≥ 0');
    expect(() => runNode({ ...semiNode, outputCapW: Number.NaN }, constant(0), constant(0), ALWAYS, 20)).toThrow('cap ≥ 0');
  });

  it('expands a schedule to every engine hour in local time, once per schedule', () => {
    const calendar = buildCalendar();
    const week = Array.from({ length: 168 }, (_, hour) => (hour === 7 ? 1 : 0)); // Monday 07:00 local
    const hours = heatingHours(week, calendar);
    expect(hours).toHaveLength(HOURS_PER_YEAR);
    // 1 January 2026 is a Thursday, so the first Monday is 5 January: 07:00 GMT is engine hour 4 × 24 + 7.
    expect(hours.indexOf(1)).toBe(4 * 24 + 7);
    // In summer time, 07:00 local is 06:00 UTC: the first Monday in July is 6 July, day 186.
    expect(hours[186 * 24 + 6]).toBe(1);
    expect(hours.reduce((total, on) => total + on, 0)).toBe(52);
    expect(heatingHours(week, calendar)).toBe(hours);
    // Another calendar gets its own expansion: in 2025, 1 January is a Wednesday, so the first Monday is day 5.
    expect(heatingHours(week, buildCalendar(2025)).indexOf(1)).toBe(5 * 24 + 7);
  });

  it('accepts 168 values of 0 or 1 only', () => {
    const week = Array.from({ length: 168 }, (_, hour) => (hour % 2 === 0 ? 1 : 0));
    expect(checkSchedule(week, 'test')).toBe(week);
    expect(() => checkSchedule(week.slice(1), 'test')).toThrow('The test schedule must be 168 values');
    expect(() => checkSchedule([...week.slice(1), 0.5], 'test')).toThrow('each 0 (off) or 1');
  });
});
