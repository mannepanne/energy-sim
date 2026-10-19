// ABOUT: Physics checks on a full simulated year: totals, energy balance, monotonic responses to inputs,
// ABOUT: the hand-calculated fixture house, and the HEM check for the benchmark archetype on PVGIS weather

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { defaultHouse } from './archetypes.ts';
import { readInputs, type EngineInputs } from './inputs.ts';
import { simulate } from './simulate.ts';
import { fixtureAccessor, type FixtureValues } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot, type PreparedWeather } from './weather.ts';

const snapshot = loadPvgisSnapshot(
  JSON.parse(readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8')) as unknown,
);
const weather = weatherFromSnapshot(snapshot);

const run = (values: FixtureValues, setup: 'gas' | 'heatPump' = 'gas') => {
  const inputs = readInputs(fixtureAccessor(values));
  return simulate(inputs, prepareWeather(weather, inputs), setup);
};

/** The engine's result on the HEM check, pinned so a change to the solar or heat loss method shows up here. */
const HEM_CHECK_ENGINE_KWH = 12_999;

/** The fixture house's hot water: 100 litres a day heated by 40 K. */
const hotWaterPerDay = (100 * 4.18 * 40) / 3600;

const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

/** Constant 5 °C and no sun, so every hour of the fixture house can be worked by hand. */
const flatWeather: PreparedWeather = {
  outdoorTemperatureC: new Float64Array(HOURS_PER_YEAR).fill(5),
  meanVerticalIrradiance: new Float64Array(HOURS_PER_YEAR),
};

describe('the fixture house by hand (REFERENCE/engine.md)', () => {
  const inputs: EngineInputs = readInputs(fixtureAccessor());
  const gas = simulate(inputs, flatWeather, 'gas');
  const heatPump = simulate(inputs, flatWeather, 'heatPump');

  it('needs 3.275 kWh of space heat every hour, 28,689 kWh a year', () => {
    expect(gas.annual.spaceHeatKwh).toBeCloseTo(3.275 * 8760, 6);
    expect(gas.annual.spaceHeatKwh).toBeCloseTo(28_689, 6);
  });

  it('gas setup: (space heat + 365 × 4.644 kWh hot water) ÷ 0.8 of gas, and the bill and carbon that follow', () => {
    const heat = 28_689 + 365 * hotWaterPerDay;
    expect(gas.annual.hotWaterKwh).toBeCloseTo(365 * hotWaterPerDay, 6);
    expect(gas.annual.gasKwh).toBeCloseTo(heat / 0.8, 6);
    expect(gas.annual.electricityKwh).toBeCloseTo(2920, 6);
    expect(gas.annual.cost.totalPounds).toBeCloseTo((heat / 0.8) * 0.08 + 109.5 + 2920 * 0.25 + 182.5, 6);
    expect(gas.annual.carbonKg).toBeCloseTo((heat / 0.8) * 0.2 + 2920 * 0.1, 6);
  });

  it('heat pump setup: (space heat + hot water + 1.5 kWh a day of cylinder loss) ÷ 2.5, plus base electricity', () => {
    // The even draw and loss (0.256 kWh an hour) empty the 1.16 kWh band every 5 hours, and 8,760 hours is a whole
    // number of 5-hour cycles, so the cylinder ends the year full and its reheats equal draw plus loss exactly.
    const heat = 28_689 + 365 * (hotWaterPerDay + 1.5);
    expect(heatPump.annual.heatKwh).toBeCloseTo(heat, 6);
    expect(heatPump.annual.gasKwh).toBe(0);
    expect(heatPump.annual.heatingElectricityKwh).toBeCloseTo(heat / 2.5, 6);
    expect(heatPump.annual.electricityKwh).toBeCloseTo(heat / 2.5 + 2920, 6);
    expect(heatPump.annual.cost.totalPounds).toBeCloseTo((heat / 2.5 + 2920) * 0.25 + 182.5, 6);
  });
});

describe('a simulated year', () => {
  const gas = run({});
  const heatPump = run({}, 'heatPump');

  it('has exactly 8,760 steps, and annual totals equal the sum of the hours', () => {
    for (const series of Object.values(gas.hourly)) expect(series).toHaveLength(HOURS_PER_YEAR);
    expect(gas.annual.spaceHeatKwh).toBeCloseTo(sum(gas.hourly.spaceHeatKwh), 9);
    expect(gas.annual.hotWaterKwh).toBeCloseTo(sum(gas.hourly.hotWaterKwh), 9);
    expect(gas.annual.gasKwh).toBeCloseTo(sum(gas.hourly.gasKwh), 9);
    expect(heatPump.annual.electricityKwh).toBeCloseTo(sum(heatPump.hourly.electricityKwh), 9);
  });

  it('supplies exactly the heat demanded in every hour', () => {
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const demand = gas.hourly.spaceHeatKwh[hour]! + gas.hourly.hotWaterKwh[hour]!;
      expect(gas.hourly.gasKwh[hour]! * 0.8).toBeCloseTo(demand, 12);
    }
    expect(heatPump.annual.heatKwh / heatPump.annual.heatingElectricityKwh).toBeCloseTo(2.5, 12);
  });

  it('has hours of zero space heat in summer, and space heat in every winter night hour', () => {
    expect(gas.hourly.spaceHeatKwh.some((value) => value === 0)).toBe(true);
    expect(gas.hourly.spaceHeatKwh[0]).toBeGreaterThan(0);
  });

  it('pays no gas standing charge for the heat pump house, and the electricity standing charge in both', () => {
    expect(heatPump.annual.cost.gasStandingPounds).toBe(0);
    expect(gas.annual.cost.gasStandingPounds).toBeGreaterThan(0);
    expect(heatPump.annual.cost.electricityStandingPounds).toBe(gas.annual.cost.electricityStandingPounds);
  });

  it('needs less heat with a lower fabric quality factor, and more with a colder outdoor offset', () => {
    expect(run({ 'fabric.qualityFactor': 0.8 }).annual.spaceHeatKwh).toBeLessThan(gas.annual.spaceHeatKwh);
    expect(run({ 'weather.outdoorTemperatureOffset': -1 }).annual.spaceHeatKwh).toBeGreaterThan(gas.annual.spaceHeatKwh);
  });

  it('uses less heat pump electricity at a higher SPF', () => {
    let previous = Infinity;
    for (const spf of [2, 2.5, 2.8, 3.2, 4]) {
      const electricity = run({ 'heating.heatPumpSpf': spf }, 'heatPump').annual.heatingElectricityKwh;
      expect(electricity).toBeLessThan(previous);
      previous = electricity;
    }
  });

  it('adds the boiler’s pump and fan electricity to the gas setup only, in proportion to its gas use', () => {
    const withAuxiliary = run({ 'heating.boilerAuxiliaryElectricity': 100 });
    expect(withAuxiliary.annual.auxiliaryElectricityKwh).toBeCloseTo(100, 9);
    expect(withAuxiliary.annual.electricityKwh).toBeCloseTo(2920 + 100, 9);
    expect(withAuxiliary.annual.gasKwh).toBe(gas.annual.gasKwh);
    for (const hour of [0, 4000]) {
      const auxiliary = withAuxiliary.hourly.electricityKwh[hour]! - 2920 / HOURS_PER_YEAR;
      expect(auxiliary).toBeCloseTo((withAuxiliary.hourly.gasKwh[hour]! / withAuxiliary.annual.gasKwh) * 100, 12);
    }
    expect(run({ 'heating.boilerAuxiliaryElectricity': 100 }, 'heatPump').annual.auxiliaryElectricityKwh).toBe(0);
  });

  it('draws hot water in local time: an 07:00 draw is at 07:00 UTC in January and 06:00 UTC in July', () => {
    const atSeven = Array.from({ length: 24 }, (_, hour) => (hour === 7 ? 1 : 0));
    const result = run({ 'hotWater.drawOffProfile': atSeven });
    const january = 10 * 24;
    const july = 190 * 24;
    expect(result.hourly.hotWaterKwh[january + 7]).toBeCloseTo(hotWaterPerDay, 12);
    expect(result.hourly.hotWaterKwh[july + 6]).toBeCloseTo(hotWaterPerDay, 12);
    expect(result.hourly.hotWaterKwh[july + 7]).toBe(0);
    expect(result.annual.hotWaterKwh).toBeCloseTo(365 * hotWaterPerDay, 9);
  });

  it('solves k on its own run unless given one, and a k from another run changes the year’s efficiency', () => {
    expect(gas.copScale).toBeUndefined();
    const scale = heatPump.copScale!;
    expect(simulate(readInputs(fixtureAccessor()), prepareWeather(weather, readInputs(fixtureAccessor())), 'heatPump', { copScale: scale }).annual).toEqual(
      heatPump.annual,
    );
    const lower = run({ 'heating.heatPumpSpf': 2 }, 'heatPump').copScale!;
    const inputs = readInputs(fixtureAccessor());
    const atLowerK = simulate(inputs, prepareWeather(weather, inputs), 'heatPump', { copScale: lower });
    expect(atLowerK.annual.heatKwh / atLowerK.annual.heatingElectricityKwh).toBeCloseTo(2, 9);
  });

  it('scales gas use exactly with 1 ÷ boiler efficiency', () => {
    const at80 = run({ 'heating.boilerSeasonalEfficiency': 0.8 }).annual.gasKwh;
    const at90 = run({ 'heating.boilerSeasonalEfficiency': 0.9 }).annual.gasKwh;
    expect(at90 / at80).toBeCloseTo(0.8 / 0.9, 12);
  });
});

describe('the HEM check (benchmark archetype at 17.8 °C air on the PVGIS year)', () => {
  // HEM's own inputs, copied from scripts/benchmark/draftValues.ts rather than imported, so the check stays
  // independent. The engine is given HEM's element areas directly, not derived geometry, so both sides describe
  // the same house. HEM's input has no party wall loss, no thermal bridging and no curtains, so those are 0 here.
  // Solar access is 1 because the HEM windows have no shading; the g-value 0.63 and frame factor 0.7 match HEM's
  // windows, and SAP's 0.9 for non-normal incidence stays, as HEM models the angle of incidence itself.
  const windowAreaM2 = 0.122 * 90 + 6.875;
  const access = fixtureAccessor({
    'fabric.wallUValue': 1.5,
    'fabric.windowUValue': 2.8,
    'fabric.windowCurtainResistance': 0,
    'fabric.doorUValue': 3,
    'fabric.roofUValue': 0.4,
    'fabric.airChangeRate': 1,
    'fabric.partyWallUValue': 0,
    'fabric.thermalBridging': 0,
    'gains.perFloorArea': 5,
    'gains.perOccupant': 0,
    'gains.windowGValue': 0.63,
    'gains.nonNormalIncidenceFactor': 0.9,
    'gains.windowFrameFactor': 0.7,
    'gains.solarAccessFactor': 1,
    'heating.meanInternalTemperature': 17.8,
  });
  const inputs: EngineInputs = {
    ...readInputs(access, { house: { ...defaultHouse(access, 'semi1930s'), floorAreaM2: 90 } }),
    heatedVolumeM3: 90 * 2.5,
    externalWallAreaM2: 20 * 2.5 * 2 - windowAreaM2 - 1.85,
    partyWallAreaM2: 0,
    windowAreaM2,
    doorAreaM2: 1.85,
    roofAreaM2: 45,
    groundFloorAreaM2: 45,
    groundFloorUValue: 0.75,
  };

  it('gives annual space heat within 10% of HEM’s thermostat-17 run (13,660 kWh)', () => {
    const result = simulate(inputs, prepareWeather(weather, inputs), 'gas');
    expect(inputs.internalGainsW).toBe(450);
    expect(result.heatLoss.totalWPerK).toBeCloseTo(302, 0);
    expect(Math.round(result.annual.spaceHeatKwh)).toBe(HEM_CHECK_ENGINE_KWH);
    expect(Math.abs(result.annual.spaceHeatKwh / 13_660 - 1)).toBeLessThan(0.1);
  });
});
