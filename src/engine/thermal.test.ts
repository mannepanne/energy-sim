// ABOUT: Physics checks on the thermal-mass node: the no-mass limit, free decay, the energy balance and the output cap
// ABOUT: Also the schedule helpers, and that every archetype's time constant is long enough for an hourly step

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { ARCHETYPE_KEYS, defaultHouse } from './archetypes.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { totalGainsW } from './demand.ts';
import { heatLoss } from './geometry.ts';
import { readInputs } from './inputs.ts';
import { checkSchedule, hourlySetpoints, PRE_ROLL_HOURS, runThermalNode, type ThermalNode } from './thermal.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = createAccessor(loadRegister(readJson('../../data/register.json')));
const weather = weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')));

const constant = (value: number): Float64Array => new Float64Array(HOURS_PER_YEAR).fill(value);
const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);
const OFF = Number.NaN;

/** The 1930s semi at its defaults on the PVGIS year: H, C, outdoor temperature and gains. */
const semi = readInputs(access);
const prepared = prepareWeather(weather, semi);
const semiH = heatLoss(semi).totalWPerK;
const semiGains = totalGainsW(semi, prepared.meanVerticalIrradiance);
const semiNode: ThermalNode = { heatLossWPerK: semiH, heatCapacityWhPerK: semi.heatCapacityWhPerK, outputCapW: Infinity };

/** Phase 1's continuous method: max(0, H (T_set − T_out) − G) each hour. */
const phase1SpaceHeatKwh = (setpointC: number): number =>
  sum(prepared.outdoorTemperatureC.map((outdoor, hour) => Math.max(0, semiH * (setpointC - outdoor) - semiGains[hour]!) / 1000));

describe('the no-mass limit and continuous heating', () => {
  it('with C = 0 reproduces phase 1’s continuous method exactly (within 0.5%)', () => {
    const year = runThermalNode({ ...semiNode, heatCapacityWhPerK: 0 }, prepared.outdoorTemperatureC, semiGains, constant(19), 19);
    const phase1 = phase1SpaceHeatKwh(19);
    expect(sum(year.spaceHeatKwh) / phase1 - 1).toBeCloseTo(0, 12);
  });

  it('with full C lowers continuous heating, by storing daytime surplus: by 11.4%, 8.0% and 5.5% at 16, 19 and 21 °C', () => {
    // The one node holds its mass at the air temperature, so it stores surplus more readily than a real house
    // (8.4% below HEM's continuous run with the same mass; see scripts/benchmark/hem/README.md).
    // The spec expected under 5%; the gap is larger at lower setpoints, where more hours float above the setpoint.
    const reduction = (setpoint: number): number =>
      1 - sum(runThermalNode(semiNode, prepared.outdoorTemperatureC, semiGains, constant(setpoint), setpoint).spaceHeatKwh) / phase1SpaceHeatKwh(setpoint);
    expect(reduction(16)).toBeCloseTo(0.114, 3);
    expect(reduction(19)).toBeCloseTo(0.08, 3);
    expect(reduction(21)).toBeCloseTo(0.055, 3);
  });
});

describe('free decay with the heating off', () => {
  const decay = (timeConstantHours: number) => {
    const heatLossWPerK = 100;
    const node = { heatLossWPerK, heatCapacityWhPerK: timeConstantHours * heatLossWPerK, outputCapW: Infinity };
    // Heated to 20 °C through the pre-roll, then off from hour 0 at 0 °C outdoors with no gains.
    const outdoor = constant(0);
    const setpoints = constant(OFF);
    for (let hour = HOURS_PER_YEAR - PRE_ROLL_HOURS; hour < HOURS_PER_YEAR; hour += 1) {
      outdoor[hour] = 20;
      setpoints[hour] = 20;
    }
    const year = runThermalNode(node, outdoor, constant(0), setpoints, 20);
    expect(year.startTemperatureC).toBeCloseTo(20, 12);
    let largestError = 0;
    for (let hour = 0; hour < 10 * timeConstantHours; hour += 1) {
      const exact = 20 * Math.exp(-(hour + 1) / timeConstantHours);
      largestError = Math.max(largestError, Math.abs(year.internalTemperatureC[hour]! - exact) / 20);
    }
    return { year, largestError };
  };

  it.each([10, 20, 50])('decays towards outdoor within 2% of the exact exponential at a %i-hour time constant', (timeConstant) => {
    const { year, largestError } = decay(timeConstant);
    // The error is measured as a share of the initial difference: about 1.8% at 10 hours, and smaller above.
    expect(largestError).toBeLessThan(0.02);
    expect(sum(year.spaceHeatKwh.subarray(0, HOURS_PER_YEAR - PRE_ROLL_HOURS))).toBe(0);
    // One backward Euler step: T₁ = T₀ ÷ (1 + 1 h ÷ τ).
    expect(year.internalTemperatureC[0]).toBeCloseTo(20 / (1 + 1 / timeConstant), 9);
  });

  it('is about 1.8% at 10 hours, the shortest time constant it is used at', () => {
    expect(decay(10).largestError).toBeCloseTo(0.0176, 3);
  });

  it('gives every archetype a time constant C ÷ H of at least 10 hours, at its defaults', () => {
    for (const archetype of ARCHETYPE_KEYS) {
      const inputs = readInputs(access, { house: defaultHouse(access, archetype) });
      expect(inputs.heatCapacityWhPerK / heatLoss(inputs).totalWPerK, archetype).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('a scheduled year on the PVGIS weather', () => {
  // SAP's weekday pattern every day, at 20 °C, on GMT, enough to exercise warm-up, cooling and free-floating.
  const hours = new Set([7, 8, 16, 17, 18, 19, 20, 21, 22]);
  const setpoints = Float64Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hours.has(hour % 24) ? 20 : OFF));
  const capW = 6000;
  const year = runThermalNode({ ...semiNode, outputCapW: capW }, prepared.outdoorTemperatureC, semiGains, setpoints, 20);

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
    let capped = 0;
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const heatW = year.spaceHeatKwh[hour]! * 1000;
      expect(heatW).toBeLessThanOrEqual(capW + 1e-9);
      if (heatW >= capW - 1e-9) capped += 1;
      else if (heatW > 0) expect(year.internalTemperatureC[hour]).toBeCloseTo(20, 9);
    }
    expect(capped).toBeGreaterThan(0);
  });

  it('heats only in heating periods, and lets the house float above the setpoint on warm days', () => {
    const offHours = year.spaceHeatKwh.filter((_, hour) => Number.isNaN(setpoints[hour]!));
    expect(sum(offHours)).toBe(0);
    expect(Math.max(...year.internalTemperatureC)).toBeGreaterThan(24);
  });

  it('uses less heat with a lower cap, since the house is then colder after each off period', () => {
    const lowCap = runThermalNode({ ...semiNode, outputCapW: 3000 }, prepared.outdoorTemperatureC, semiGains, setpoints, 20);
    expect(sum(lowCap.spaceHeatKwh)).toBeLessThan(sum(year.spaceHeatKwh));
  });

  it('uses more heat than with no mass, which reaches the setpoint at once and loses nothing while off', () => {
    const noMass = runThermalNode({ ...semiNode, heatCapacityWhPerK: 0, outputCapW: capW }, prepared.outdoorTemperatureC, semiGains, setpoints, 20);
    expect(sum(year.spaceHeatKwh)).toBeGreaterThan(sum(noMass.spaceHeatKwh));
  });
});

describe('input checks and schedule helpers', () => {
  it('rejects series of the wrong length and an invalid node', () => {
    const short = new Float64Array(24);
    expect(() => runThermalNode(semiNode, short, constant(0), constant(20), 20)).toThrow('8760 hours');
    expect(() => runThermalNode(semiNode, constant(0), short, constant(20), 20)).toThrow('8760 hours');
    expect(() => runThermalNode(semiNode, constant(0), constant(0), short, 20)).toThrow('8760 hours');
    expect(() => runThermalNode({ ...semiNode, heatLossWPerK: 0 }, constant(0), constant(0), constant(20), 20)).toThrow('H > 0');
    expect(() => runThermalNode({ ...semiNode, heatCapacityWhPerK: -1 }, constant(0), constant(0), constant(20), 20)).toThrow('C ≥ 0');
    expect(() => runThermalNode({ ...semiNode, outputCapW: Number.NaN }, constant(0), constant(0), constant(20), 20)).toThrow('cap ≥ 0');
  });

  it('turns an expanded schedule into setpoints, NaN where heating is off', () => {
    const setpoints = hourlySetpoints(Float64Array.from([1, 0, 1]), 19);
    expect([...setpoints]).toEqual([19, Number.NaN, 19]);
  });

  it('accepts 168 values of 0 or 1 only', () => {
    const week = Array.from({ length: 168 }, (_, hour) => (hour % 2 === 0 ? 1 : 0));
    expect(checkSchedule(week, 'test')).toBe(week);
    expect(() => checkSchedule(week.slice(1), 'test')).toThrow('The test schedule must be 168 values');
    expect(() => checkSchedule([...week.slice(1), 0.5], 'test')).toThrow('each 0 (off) or 1');
  });
});
