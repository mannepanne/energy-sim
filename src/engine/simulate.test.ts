// ABOUT: Physics checks on a full simulated year: totals, energy balance, monotonic responses to inputs,
// ABOUT: the hand-calculated fixture house, and the HEM check for the benchmark archetype on PVGIS weather

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { defaultHouse } from './archetypes.ts';
import { readInputs, type EngineInputs } from './inputs.ts';
import { heatPumpOutputCapW, simulate } from './simulate.ts';
import { totalGainsW } from './demand.ts';
import { heatLoss } from './geometry.ts';
import { runThermalNode } from './thermal.ts';
import { sunPath } from './solar.ts';
import { CONTINUOUS_SCHEDULE, fixtureAccessor, type FixtureValues } from './testing/fixtureRegister.ts';
import { prepareWeather, weatherFromSnapshot, type PreparedWeather } from './weather.ts';
import { heatingTargets } from './control.ts';

/** The node on a heating schedule at one setpoint, starting the pre-roll at the setpoint. */
const runNode = (node: Parameters<typeof runThermalNode>[0], outdoorC: Float64Array, gainsW: Float64Array, heatingOn: ArrayLike<number>, setpointC: number) =>
  runThermalNode(node, outdoorC, gainsW, heatingTargets(heatingOn, setpointC), setpointC);

const snapshot = loadPvgisSnapshot(
  JSON.parse(readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8')) as unknown,
);
const weather = weatherFromSnapshot(snapshot);

const run = (values: FixtureValues, setup: 'gas' | 'heatPump' = 'gas') => {
  const inputs = readInputs(fixtureAccessor(values));
  return simulate(inputs, prepareWeather(weather, inputs), setup);
};

/** The engine's results on the HEM checks, pinned so a change to the solar, heat loss or thermal method shows up here. */
const HEM_CHECK_ENGINE_KWH = 12_999;
const HEM_SCHEDULED_CHECK_ENGINE_KWH = 14_165;
const HEM_CONTINUOUS_WITH_MASS_ENGINE_KWH = 15_851;
const HEM_UNIMODAL_CHECK_ENGINE_KWH = 14_489;

/** The fixture house's hot water: 100 litres a day heated by 40 K. */
const hotWaterPerDay = (100 * 4.18 * 40) / 3600;

const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

/** Constant 5 °C and no sun, so every hour of the fixture house can be worked by hand. */
const flatWeather: PreparedWeather = {
  outdoorTemperatureC: new Float64Array(HOURS_PER_YEAR).fill(5),
  meanVerticalIrradiance: new Float64Array(HOURS_PER_YEAR),
  irradiance: {
    latitudeDeg: 51.5,
    longitudeDeg: 0,
    globalHorizontal: new Float64Array(HOURS_PER_YEAR),
    beamNormal: new Float64Array(HOURS_PER_YEAR),
    diffuseHorizontal: new Float64Array(HOURS_PER_YEAR),
  },
  sunPath: sunPath({ latitudeDeg: 51.5, longitudeDeg: 0 }, 10),
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

describe('roof solar on the fixture house by hand', () => {
  // No beam, and 100 W/m² of diffuse and global in every hour, so the 35° roof gets the same irradiance every hour:
  // 100 × (1 + cos 35°)/2 + 100 × 0.2 × (1 − cos 35°)/2 W/m². The fixture's 4 kWp with a 10% loss and no temperature
  // effect then makes 4 × that ÷ 1,000 × 0.9 kWh an hour.
  const cos35 = Math.cos((35 * Math.PI) / 180);
  const onRoofW = (100 * (1 + cos35)) / 2 + (100 * 0.2 * (1 - cos35)) / 2;
  const perHourKwh = (4 * onRoofW * 0.9) / 1000;
  const diffuseWeather: PreparedWeather = {
    ...flatWeather,
    irradiance: { ...flatWeather.irradiance, globalHorizontal: new Float64Array(HOURS_PER_YEAR).fill(100), diffuseHorizontal: new Float64Array(HOURS_PER_YEAR).fill(100) },
  };
  const inputs = readInputs(fixtureAccessor());
  const gas = simulate(inputs, diffuseWeather, 'gas', { solar: true });
  const heatPump = simulate(inputs, diffuseWeather, 'heatPump', { solar: true });

  it('generates the same every hour: 0.334 kWh, 2,926 kWh a year', () => {
    expect(perHourKwh).toBeCloseTo(0.334, 3);
    expect(gas.annual.generationKwh).toBeCloseTo(perHourKwh * HOURS_PER_YEAR, 6);
    expect(gas.pvPeakPowerKw).toBe(4);
  });

  it('gas: solar covers the 1/3 kWh of base use in every hour, so nothing is imported and the rest is exported', () => {
    expect(gas.annual.importKwh).toBe(0);
    expect(gas.annual.exportKwh).toBeCloseTo((perHourKwh - 1 / 3) * HOURS_PER_YEAR, 6);
    expect(gas.annual.solarUsedBy.baseKwh).toBeCloseTo(2920, 6);
    expect(gas.annual.cost.electricityUnitPounds).toBe(0);
    expect(gas.annual.carbonKg).toBeCloseTo(gas.annual.gasKwh * 0.2, 6);
  });

  it('heat pump: every kWh generated is used, so import is electricity minus generation', () => {
    expect(heatPump.annual.exportKwh).toBe(0);
    expect(heatPump.annual.importKwh).toBeCloseTo(heatPump.annual.electricityKwh - perHourKwh * HOURS_PER_YEAR, 6);
    expect(heatPump.annual.solarUsedBy.baseKwh).toBeCloseTo(2920, 6);
    expect(heatPump.annual.solarUsedBy.heatingKwh).toBeCloseTo((perHourKwh - 1 / 3) * HOURS_PER_YEAR, 6);
    expect(heatPump.annual.solarUsedBy.cylinderKwh).toBe(0);
    expect(heatPump.annual.cost.electricityUnitPounds).toBeCloseTo(heatPump.annual.importKwh * 0.25, 6);
  });
});

describe('roof solar on the PVGIS year', () => {
  const inputs = readInputs(fixtureAccessor());
  const prepared = prepareWeather(weather, inputs);
  const results = (['gas', 'heatPump'] as const).map((setup) => ({
    without: simulate(inputs, prepared, setup),
    with: simulate(inputs, prepared, setup, { solar: true }),
  }));

  it('changes nothing without solar: import is the electricity used, with no generation or export', () => {
    for (const { without } of results) {
      expect(without.solar).toBe(false);
      expect(without.pvPeakPowerKw).toBe(0);
      expect(without.hourly.importKwh).toBe(without.hourly.electricityKwh);
      expect(without.annual.generationKwh).toBe(0);
      expect(without.annual.exportKwh).toBe(0);
      expect(without.annual.importKwh).toBe(without.annual.electricityKwh);
    }
  });

  it('balances every hour, never exports more than it generates, and leaves heat and electricity use unchanged', () => {
    for (const { without, with: solar } of results) {
      for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
        const generation = solar.hourly.generationKwh[hour]!;
        expect(solar.hourly.exportKwh[hour]!).toBeGreaterThanOrEqual(0);
        expect(solar.hourly.exportKwh[hour]!).toBeLessThanOrEqual(generation);
        expect(generation + solar.hourly.importKwh[hour]!).toBeCloseTo(solar.hourly.electricityKwh[hour]! + solar.hourly.exportKwh[hour]!, 12);
      }
      expect(solar.annual.selfConsumedKwh + solar.annual.exportKwh).toBeCloseTo(solar.annual.generationKwh, 9);
      expect(solar.annual.importKwh + solar.annual.selfConsumedKwh).toBeCloseTo(solar.annual.electricityKwh, 9);
      const used = solar.annual.solarUsedBy;
      expect(used.baseKwh + used.heatingKwh + used.cylinderKwh).toBeCloseTo(solar.annual.selfConsumedKwh, 9);
      expect(solar.annual.heatKwh).toBe(without.annual.heatKwh);
      expect(solar.annual.electricityKwh).toBe(without.annual.electricityKwh);
    }
  });

  it('generates about 1,000 kWh per kWp, uses some and exports some', () => {
    const solar = results[0]!.with;
    expect(solar.annual.generationKwh / 4).toBeGreaterThan(900);
    expect(solar.annual.generationKwh / 4).toBeLessThan(1150);
    expect(solar.annual.selfConsumedKwh).toBeGreaterThan(0);
    expect(solar.annual.exportKwh).toBeGreaterThan(0);
  });

  it('lowers cost by the imports saved plus export income, and carbon by the imports saved, with no credit for export', () => {
    for (const { without, with: solar } of results) {
      const saved = without.annual.importKwh - solar.annual.importKwh;
      expect(saved).toBeCloseTo(solar.annual.selfConsumedKwh, 9);
      // 25p a kWh saved on imports, and the fixture's 10p a kWh for export.
      expect(solar.annual.cost.exportPounds).toBeCloseTo((solar.annual.exportKwh * 10) / 100, 9);
      expect(without.annual.cost.totalPounds - solar.annual.cost.totalPounds).toBeCloseTo((saved * 25 + solar.annual.exportKwh * 10) / 100, 9);
      expect(without.annual.carbonKg - solar.annual.carbonKg).toBeCloseTo(saved * 0.1, 9);
    }
  });

  it('meets the cylinder only in the heat pump setup, and leaves k unchanged', () => {
    const [gas, heatPump] = results;
    expect(gas!.with.annual.solarUsedBy.cylinderKwh).toBe(0);
    expect(heatPump!.with.annual.solarUsedBy.cylinderKwh).toBeGreaterThan(0);
    expect(heatPump!.with.copScale).toEqual(heatPump!.without.copScale);
  });

  it('makes less on a roof facing south-west than south, and none on a system of zero size', () => {
    const southWest = simulate({ ...inputs, pv: { ...inputs.pv, azimuth: Math.PI / 4 } }, prepared, 'gas', { solar: true });
    expect(southWest.annual.generationKwh).toBeLessThan(results[0]!.with.annual.generationKwh);
    const none = simulate({ ...inputs, pv: { ...inputs.pv, peakPowerKw: 0 } }, prepared, 'gas', { solar: true });
    expect(none.annual.generationKwh).toBe(0);
    expect(none.annual.importKwh).toBeCloseTo(none.annual.electricityKwh, 9);
  });
});

describe('heating schedules and output caps on the PVGIS year', () => {
  const daytime = Array.from({ length: 168 }, (_, hour) => (hour % 24 >= 7 && hour % 24 < 23 ? 1 : 0));
  const scheduled = (values: FixtureValues = {}) => {
    const inputs = readInputs(fixtureAccessor({ 'heating.scheduleGas': daytime, 'heating.scheduleHeatPump': daytime, ...values }));
    return { inputs, weather: prepareWeather(weather, inputs) };
  };

  it('caps the heat pump at H × the design temperature difference × the margin, and the boiler at its rated output', () => {
    const { inputs, weather: prepared } = scheduled();
    const heatPump = simulate(inputs, prepared, 'heatPump');
    expect(heatPump.outputCapW).toBeCloseTo(heatPump.heatLoss.totalWPerK * 24 * 1, 9);
    expect(heatPumpOutputCapW(inputs, 100)).toBe(2400);
    expect(simulate(inputs, prepared, 'gas').outputCapW).toBe(24_000);
    expect(Math.max(...heatPump.hourly.spaceHeatKwh)).toBeLessThanOrEqual(heatPump.outputCapW / 1000 + 1e-12);
  });

  it('delivers less heat, and a colder house, when the cap binds after each night off', () => {
    const { inputs, weather: prepared } = scheduled({ 'heating.boilerRatedOutput': 3 });
    const capped = simulate(inputs, prepared, 'gas');
    const uncapped = simulate({ ...inputs, boilerOutputCapW: Infinity }, prepared, 'gas');
    expect(Math.max(...capped.hourly.spaceHeatKwh)).toBeCloseTo(3, 9);
    expect(capped.annual.spaceHeatKwh).toBeLessThan(uncapped.annual.spaceHeatKwh);
    expect(sum(capped.hourly.internalTemperatureC)).toBeLessThan(sum(uncapped.hourly.internalTemperatureC));
  });

  it('heats only in the schedule’s hours, which follow UK local time', () => {
    const { inputs, weather: prepared } = scheduled();
    const result = simulate(inputs, prepared, 'gas');
    // 2 January is a Friday in winter (GMT): no heat from 23:00 to 07:00.
    for (let hour = 24 + 0; hour < 24 + 7; hour += 1) expect(result.hourly.spaceHeatKwh[hour]).toBe(0);
    expect(result.hourly.spaceHeatKwh[24 + 7]).toBeGreaterThan(0);
  });

  it('solves k on the gas schedule when the heat pump’s own schedule differs, then uses it on that schedule', () => {
    const { inputs, weather: prepared } = scheduled({ 'heating.scheduleHeatPump': CONTINUOUS_SCHEDULE });
    const own = simulate(inputs, prepared, 'heatPump');
    const reference = simulate({ ...inputs, heatPumpSchedule: inputs.gasSchedule }, prepared, 'heatPump');
    expect(own.copScale).toEqual(reference.copScale);
    expect(reference.annual.heatKwh / reference.annual.heatingElectricityKwh).toBeCloseTo(inputs.heatPumpSpf, 9);
    // Heating through the night moves heat into colder hours, so the year's efficiency falls below the SPF.
    expect(own.annual.spaceHeatKwh).toBeGreaterThan(reference.annual.spaceHeatKwh);
    expect(own.annual.heatKwh / own.annual.heatingElectricityKwh).toBeLessThan(inputs.heatPumpSpf);
  });
});

describe('the HEM checks (benchmark archetype on the PVGIS year)', () => {
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
    'heating.setpoint': 17.8,
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

  const prepared = prepareWeather(weather, inputs);

  it('continuous: gives annual space heat within 10% of HEM’s thermostat-17 run (13,660 kWh) at 17.8 °C air', () => {
    // The steady-state guard on heat loss and gains, so it runs without thermal mass, as in phase 1. The fixture's
    // schedules heat in every hour. The scheduled check below guards the thermal node.
    const result = simulate({ ...inputs, heatCapacityWhPerK: 0 }, prepared, 'gas');
    expect(inputs.internalGainsW).toBe(450);
    expect(result.heatLoss.totalWPerK).toBeCloseTo(302, 0);
    expect(Math.round(result.annual.spaceHeatKwh)).toBe(HEM_CHECK_ENGINE_KWH);
    expect(Math.abs(result.annual.spaceHeatKwh / 13_660 - 1)).toBeLessThan(0.1);
  });

  // The decision run's rules (scripts/benchmark/hem/README.md, committed before HEM ran): SAP's periods on GMT all
  // year, weekdays from 2026 (1 January a Thursday), 19.8 °C air, C = 250 kJ/m²K × 90 m², and no output cap.
  const SAP_WEEKDAY_HOURS = [7, 8, 16, 17, 18, 19, 20, 21, 22];
  const SAP_WEEKEND_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const THURSDAY = 3;
  const node = { heatLossWPerK: heatLoss(inputs).totalWPerK, heatCapacityWhPerK: inputs.heatCapacityWhPerK, outputCapW: Infinity };
  const gains = totalGainsW(inputs, prepared.meanVerticalIrradiance);
  const runAt = (setpointC: number, pattern: 'sap' | 'unimodal' | 'continuous'): number => {
    const heating = new Uint8Array(HOURS_PER_YEAR);
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const weekday = (Math.floor(hour / 24) + THURSDAY) % 7;
      const hours = weekday < 5 && pattern === 'sap' ? SAP_WEEKDAY_HOURS : SAP_WEEKEND_HOURS;
      if (pattern === 'continuous' || hours.includes(hour % 24)) heating[hour] = 1;
    }
    return sum(runNode(node, prepared.outdoorTemperatureC, gains, heating, setpointC).spaceHeatKwh);
  };

  it('scheduled: gives annual space heat within 10% of HEM’s schedule-sap run (13,580 kWh), the pre-registered check', () => {
    expect(inputs.heatCapacityWhPerK).toBeCloseTo((250 * 90) / 3.6, 9);
    const annual = runAt(19.8, 'sap');
    expect(Math.round(annual)).toBe(HEM_SCHEDULED_CHECK_ENGINE_KWH);
    expect(Math.abs(annual / 13_580 - 1)).toBeLessThan(0.1);
  });

  it('07:00–23:00 every day: 2.4% below HEM’s schedule-unimodal run (14,842 kWh): a bias of −6.7 points against SAP’s periods', () => {
    // Pre-registered in scripts/benchmark/hem/README.md: within 15%, so the heat pump may use this schedule. The
    // bias (this gap minus the SAP schedule's +4.3%) lowers the heat pump's space heat against the boiler's.
    const annual = runAt(19.8, 'unimodal');
    expect(Math.round(annual)).toBe(HEM_UNIMODAL_CHECK_ENGINE_KWH);
    expect(Math.abs(annual / 14_842 - 1)).toBeLessThan(0.1);
  });

  it('continuous with the same mass: 8.4% below HEM’s continuous-sap-mass diagnostic (17,311 kWh)', () => {
    // A diagnostic, not a guard: one node, with all the mass at the air temperature, stores daytime surplus more
    // readily than HEM's elements, so it under-predicts heating in every hour and over-predicts heating in periods.
    const annual = runAt(19.8, 'continuous');
    expect(Math.round(annual)).toBe(HEM_CONTINUOUS_WITH_MASS_ENGINE_KWH);
    expect(annual / 17_311 - 1).toBeCloseTo(-0.084, 3);
  });
});
