// ABOUT: Tests for the heat pump COP curve: compensation line, clamped shape, the k solve with and without the ceiling,
// ABOUT: and, on the real register, the year's SPF in every sample and the order of the flow temperature rows

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import {
  checkCompensation,
  checkCurve,
  compensatedFlowC,
  copShape,
  heatPumpElectricity,
  seasonalPerformance,
  solveCopScale,
  type CompensationLine,
  type CopCurve,
  type HeatPumpLoad,
} from './heatPump.ts';
import { ARCHETYPE_KEYS, defaultHouse } from './archetypes.ts';
import { readInputs, type SpfScenario, type UncertainOverrides } from './inputs.ts';
import { sampleOverrides } from './sampling.ts';
import { simulate } from './simulate.ts';
import { prepareWeather, weatherFromSnapshot } from './weather.ts';

const curve: CopCurve = { liftAllowanceK: 10, shapeFloor: 4, shapeCeiling: 15, copCeiling: 7 };
const line: CompensationLine = { designOutdoorC: -2, designFlowC: 45, mildOutdoorC: 15, mildFlowC: 30 };

const load = (space: number[], spaceShape: number[], hotWater: number[] = [], hotWaterShape: number[] = []): HeatPumpLoad => ({
  spaceHeatKwh: Float64Array.from(space),
  spaceShape: Float64Array.from(spaceShape),
  hotWaterHeatKwh: Float64Array.from(hotWater.length > 0 ? hotWater : space.map(() => 0)),
  hotWaterShape: Float64Array.from(hotWaterShape.length > 0 ? hotWaterShape : spaceShape),
});

describe('the weather-compensation line', () => {
  it('runs from the design flow at the design outdoor temperature to the mild flow at the mild one, flat beyond', () => {
    expect(compensatedFlowC(-10, line)).toBe(45);
    expect(compensatedFlowC(-2, line)).toBe(45);
    expect(compensatedFlowC(6.5, line)).toBeCloseTo(37.5, 12);
    expect(compensatedFlowC(15, line)).toBe(30);
    expect(compensatedFlowC(25, line)).toBe(30);
  });

  it('rejects endpoints out of order', () => {
    expect(() => checkCompensation({ ...line, mildOutdoorC: -2 })).toThrow('must be below its mild one');
    expect(() => checkCompensation({ ...line, mildFlowC: 50 })).toThrow('must not be below its mild one');
    expect(() => checkCompensation(line)).not.toThrow();
  });
});

describe('the COP shape', () => {
  it('is (T_flow + 273.15) ÷ (T_flow − T_out + lift allowance) inside its clamp', () => {
    expect(copShape(45, 0, curve)).toBeCloseTo(318.15 / 55, 12);
  });

  it('falls as outdoor temperature falls, and as flow temperature rises', () => {
    expect(copShape(45, -5, curve)).toBeLessThan(copShape(45, 0, curve));
    expect(copShape(55, 0, curve)).toBeLessThan(copShape(45, 0, curve));
  });

  it('stays within its floor and ceiling, including when outdoor reaches the flow temperature', () => {
    expect(copShape(70, -30, curve)).toBe(4);
    expect(copShape(30, 25, curve)).toBe(15);
    expect(copShape(30, 45, curve)).toBe(15);
  });

  it('rejects curve parameters out of order', () => {
    expect(() => checkCurve({ ...curve, liftAllowanceK: 0 })).toThrow('lift allowance must be positive');
    expect(() => checkCurve({ ...curve, shapeFloor: 15 })).toThrow('0 < floor < ceiling');
    expect(() => checkCurve({ ...curve, shapeFloor: 0 })).toThrow('0 < floor < ceiling');
    expect(() => checkCurve({ ...curve, copCeiling: 1 })).toThrow('above 1');
    expect(() => checkCurve(curve)).not.toThrow();
  });
});

describe('the k solve', () => {
  it('is closed-form when the ceiling does not bind: k = SPF × Σ(heat ÷ shape) ÷ Σheat', () => {
    const run = load([1, 2, 3], [5, 6, 8]);
    const scale = solveCopScale(run, 3, curve);
    expect(scale.k).toBeCloseTo((3 * (1 / 5 + 2 / 6 + 3 / 8)) / 6, 12);
    expect(scale.ceilingBound).toBe(false);
    expect(seasonalPerformance(run, scale, curve)).toBeCloseTo(3, 12);
  });

  it('counts hot water heat at its own shape in the same balance', () => {
    const run = load([1, 0], [8, 8], [0, 1], [4, 4]);
    const scale = solveCopScale(run, 3, curve);
    expect(scale.k).toBeCloseTo((3 * (1 / 8 + 1 / 4)) / 2, 12);
    expect(seasonalPerformance(run, scale, curve)).toBeCloseTo(3, 12);
  });

  it('caps hours at the ceiling and re-solves k, so the year still matches the SPF', () => {
    // Closed-form k = 5 × (1/4 + 1/15) ÷ 2 = 0.79, which would put the second hour at 11.9.
    const run = load([1, 1], [4, 15]);
    const scale = solveCopScale(run, 5, curve);
    expect(scale.ceilingBound).toBe(true);
    // The second hour runs at 7, so the first needs 1 ÷ (2/5 − 1/7) = 3.889, and k = 3.889 ÷ 4.
    expect(scale.k).toBeCloseTo(1 / (2 / 5 - 1 / 7) / 4, 12);
    expect(seasonalPerformance(run, scale, curve)).toBeCloseTo(5, 12);
    const electricity = heatPumpElectricity(run, scale, curve);
    expect(1 / electricity[1]!).toBeCloseTo(7, 12);
  });

  it('settles when capping one hour pushes another over the ceiling', () => {
    const run = load([1, 1, 1, 1], [4, 9, 12, 15]);
    const scale = solveCopScale(run, 5.5, curve);
    expect(scale.ceilingBound).toBe(true);
    expect(seasonalPerformance(run, scale, curve)).toBeCloseTo(5.5, 12);
    for (const value of heatPumpElectricity(run, scale, curve)) expect(1 / value).toBeLessThanOrEqual(7 + 1e-12);
  });

  it('rejects an SPF the ceiling can never reach, a non-positive SPF, and a run with no heat', () => {
    expect(() => solveCopScale(load([1], [5]), 7, curve)).toThrow('below 1 − SPF ÷ COP ceiling');
    expect(() => solveCopScale(load([1], [5]), 0, curve)).toThrow('must be positive');
    expect(() => solveCopScale(load([0, 0], [5, 5]), 3, curve)).toThrow('delivers no heat');
  });

  it('counts standby inside the SPF: k is solved on what the heat needs after standby, and every hour draws it', () => {
    // 2 kWh of heat at SPF 2 is 1 kWh of electricity; a 20% share is 0.2 kWh of standby (0.1 an hour), leaving 0.8.
    const run = load([2, 0], [5, 5]);
    const scale = solveCopScale(run, 2, curve, 0.2);
    expect(scale.standbyKwhPerHour).toBeCloseTo(0.1, 12);
    expect(scale.k).toBeCloseTo(2 / 5 / 0.8, 12);
    expect(seasonalPerformance(run, scale, curve)).toBeCloseTo(2, 12);
    const electricity = heatPumpElectricity(run, scale, curve);
    expect(electricity[0]).toBeCloseTo(0.9, 12);
    expect(electricity[1]).toBeCloseTo(0.1, 12);
  });

  it('makes a low-heat hour less efficient than a high-heat hour at the same shape, once standby is counted', () => {
    const run = load([4, 0.5], [6, 6]);
    const electricity = heatPumpElectricity(run, solveCopScale(run, 3, curve, 0.1), curve);
    expect(0.5 / electricity[1]!).toBeLessThan(4 / electricity[0]!);
  });

  it('rejects a negative standby share, and one that leaves the heat less than the COP ceiling allows', () => {
    expect(() => solveCopScale(load([1], [5]), 3, curve, -0.1)).toThrow('must be at least 0 and below 1 − SPF ÷ COP ceiling');
    // 1 − 3 ÷ 7 = 0.571: at that share the heat would need every hour at the ceiling and then some.
    expect(() => solveCopScale(load([1], [5]), 3, curve, 0.6)).toThrow('below 1 − SPF ÷ COP ceiling');
    expect(() => solveCopScale(load([1], [5]), 3, curve, 0.5)).not.toThrow();
  });

  it('lowers the year’s efficiency when the same heat moves into colder hours at the same k', () => {
    const reference = load([2, 1], [4, 8]);
    const scale = solveCopScale(reference, 3, curve);
    const colder = load([2.5, 0.5], [4, 8]);
    expect(seasonalPerformance(colder, scale, curve)).toBeLessThan(3);
    const milder = load([1.5, 1.5], [4, 8]);
    expect(seasonalPerformance(milder, scale, curve)).toBeGreaterThan(3);
  });
});

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;

describe('the curve on the real register', () => {
  const access = createAccessor(loadRegister(readJson('../../data/register.json')));
  const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json'))), readInputs(access));
  const plan = { seed: 1, count: 200 };

  it.each<SpfScenario>(['fieldTrial', 'wellInstalled'])('gives the sampled SPF to within 0.1%% in every sample (%s)', (spfScenario) => {
    let bound = 0;
    for (const overrides of sampleOverrides(access, plan, undefined, spfScenario)) {
      const inputs = readInputs(access, { overrides, spfScenario });
      const result = simulate(inputs, weather, 'heatPump');
      expect(Math.abs(result.annual.heatKwh / result.annual.heatingElectricityKwh / inputs.heatPumpSpf - 1)).toBeLessThan(0.001);
      if (result.copScale!.ceilingBound) bound += 1;
    }
    // The ceiling binds in a few samples of each scenario, so the iterative solve is exercised on real data.
    expect(bound).toBeGreaterThan(0);
  });

  it('keeps every SPF a sample can draw below the COP ceiling, so the k solve can always reach it', () => {
    // Draws are clipped to each row's low–high, so a row's high is the largest SPF any sample can give.
    const ceiling = access.fixed('heating.copCeiling').value;
    for (const id of ['heating.heatPumpSpf', 'heating.heatPumpSpfWellInstalled'] as const) expect(access.uncertain(id).high).toBeLessThan(ceiling);
  });

  it('keeps each scenario’s highest standby share below 1 − its highest SPF ÷ the COP ceiling, so k is always solvable', () => {
    const ceiling = access.fixed('heating.copCeiling').value;
    const pairs = [
      ['heating.heatPumpSpf', 'heating.heatPumpStandbyShare'],
      ['heating.heatPumpSpfWellInstalled', 'heating.heatPumpStandbyShareWellInstalled'],
    ] as const;
    for (const [spf, share] of pairs) expect(access.uncertain(share).high).toBeLessThan(1 - access.uncertain(spf).high / ceiling);
  });

  it.each<SpfScenario>(['fieldTrial', 'wellInstalled'])(
    'solves k for a low-demand house of every archetype at the highest SPF and standby share (%s)',
    (spfScenario) => {
      const [spfRow, shareRow] =
        spfScenario === 'fieldTrial'
          ? (['heating.heatPumpSpf', 'heating.heatPumpStandbyShare'] as const)
          : (['heating.heatPumpSpfWellInstalled', 'heating.heatPumpStandbyShareWellInstalled'] as const);
      for (const archetype of ARCHETYPE_KEYS) {
        const house = { ...defaultHouse(access, archetype), occupants: 1 };
        const overrides: UncertainOverrides = {
          [spfRow]: access.uncertain(spfRow).high,
          [shareRow]: access.uncertain(shareRow).high,
          'heating.meanInternalTemperature': access.uncertain('heating.meanInternalTemperature').low,
          'fabric.qualityFactor': access.uncertain('fabric.qualityFactor').low,
        };
        const inputs = readInputs(access, { house, overrides, spfScenario });
        const result = simulate(inputs, weather, 'heatPump');
        expect(result.annual.heatKwh / result.annual.heatingElectricityKwh).toBeCloseTo(inputs.heatPumpSpf, 9);
      }
    },
  );

  it('keeps the hot water flow at or above every space heating flow, and the cylinder rows in order', () => {
    const designFlow = access.uncertain('heating.flowTemperatureAtDesign');
    const hotWaterFlow = access.fixed('hotWater.heatPumpFlowTemperature').value;
    const setpoint = access.fixed('hotWater.cylinderSetpoint').value;
    expect(hotWaterFlow).toBeGreaterThanOrEqual(designFlow.high);
    expect(hotWaterFlow).toBeGreaterThan(designFlow.default);
    // The hot water flow is a mean over each reheat, so it may equal the setpoint; it must not fall below the trigger.
    expect(hotWaterFlow).toBeGreaterThan(access.fixed('hotWater.cylinderMinimum').value);
    expect(setpoint).toBeGreaterThan(access.fixed('hotWater.cylinderMinimum').value);
    expect(access.fixed('hotWater.cylinderMinimum').value).toBeGreaterThan(access.fixed('hotWater.coldFeedTemperature').value);
  });

  it('puts hot water below space heating in every hour at the default flows, and never above it at the design flow’s high', () => {
    const high = readInputs(access, { overrides: { 'heating.flowTemperatureAtDesign': access.uncertain('heating.flowTemperatureAtDesign').high } });
    for (const temperature of weather.outdoorTemperatureC) {
      const outdoor = temperature + high.outdoorTemperatureOffsetK;
      const space = copShape(compensatedFlowC(outdoor, high.compensation), outdoor, high.copCurve);
      expect(copShape(high.hotWaterFlowTemperatureC, outdoor, high.copCurve)).toBeLessThanOrEqual(space);
    }
    const inputs = readInputs(access);
    const { shapeFloor, shapeCeiling } = inputs.copCurve;
    for (const temperature of weather.outdoorTemperatureC) {
      const outdoor = temperature + inputs.outdoorTemperatureOffsetK;
      const space = copShape(compensatedFlowC(outdoor, inputs.compensation), outdoor, inputs.copCurve);
      const hotWater = copShape(inputs.hotWaterFlowTemperatureC, outdoor, inputs.copCurve);
      // Equal only where both sit on the shape's floor, or both on its ceiling.
      const bothClamped = (hotWater === shapeFloor && space === shapeFloor) || (hotWater === shapeCeiling && space === shapeCeiling);
      expect(hotWater < space || bothClamped).toBe(true);
    }
  });

  it('keeps the scaled COP above 1 in every hour at the lowest SPF', () => {
    const lowest = access.uncertain('heating.heatPumpSpf').low;
    const overrides: UncertainOverrides = { 'heating.heatPumpSpf': lowest, 'heating.flowTemperatureAtDesign': access.uncertain('heating.flowTemperatureAtDesign').high };
    const inputs = readInputs(access, { overrides });
    const result = simulate(inputs, weather, 'heatPump');
    expect(result.copScale!.k * inputs.copCurve.shapeFloor).toBeGreaterThan(1);
  });
});
