// ABOUT: The engine's side of the HEM checks: the benchmark house as HEM's input describes it, on the PVGIS year
// ABOUT: Annual space heat heated continuously with no mass, and on the thermal node under the three scheduled runs' patterns

import { HOURS_PER_YEAR } from '../constants.ts';
import { defaultHouse } from '../archetypes.ts';
import { heatingTargets } from '../control.ts';
import { totalGainsW } from '../demand.ts';
import { heatLoss } from '../geometry.ts';
import { readInputs, type EngineInputs } from '../inputs.ts';
import { simulate } from '../simulate.ts';
import { runThermalNode } from '../thermal.ts';
import { prepareWeather, type Weather } from '../weather.ts';
import { fixtureAccessor } from './fixtureRegister.ts';

/** The heating patterns of the scheduled HEM runs: SAP's periods, 7 am to 11 pm every day, and every hour. */
export type HemPattern = 'sap' | 'unimodal' | 'continuous';

/** The air temperature fixed for the scheduled checks before HEM ran (scripts/benchmark/hem/README.md). */
export const SCHEDULED_CHECK_AIR_C = 19.8;

const SAP_WEEKDAY_HOURS = [7, 8, 16, 17, 18, 19, 20, 21, 22];
const SAP_WEEKEND_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
/** 1 January 2026 is a Thursday, day 3 counting Monday as 0. */
const THURSDAY = 3;

const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

/**
 * HEM's own inputs, copied from scripts/benchmark/draftValues.ts rather than imported, so the check stays
 * independent. The engine is given HEM's element areas directly, not derived geometry, so both sides describe
 * the same house. HEM's input has no party wall loss, no thermal bridging and no curtains, so those are 0 here.
 * Solar access is 1 because the HEM windows have no shading; the g-value 0.63 and frame factor 0.7 match HEM's
 * windows, and SAP's 0.9 for non-normal incidence stays, as HEM models the angle of incidence itself.
 */
export function hemCheckInputs(): EngineInputs {
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
  return {
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
}

export interface HemCheckEngine {
  inputs: EngineInputs;
  /** Heated in every hour at 17.8 °C air with no thermal mass, against HEM's thermostat-17 run. */
  continuousKwh: number;
  /** On the thermal node with no output cap, at `airC`, for each scheduled run's pattern. */
  scheduledKwh: (pattern: HemPattern, airC?: number) => number;
}

/**
 * The engine's annual space heat on the HEM checks. The scheduled runs' rules (scripts/benchmark/hem/README.md,
 * committed before HEM ran): the periods on GMT all year, weekdays from 2026, 19.8 °C air, C = 250 kJ/m²K × 90 m²,
 * and no output cap.
 */
export function hemCheckEngine(weather: Weather): HemCheckEngine {
  const inputs = hemCheckInputs();
  const prepared = prepareWeather(weather, inputs);
  const continuousKwh = simulate({ ...inputs, heatCapacityWhPerK: 0 }, prepared, 'gas').annual.spaceHeatKwh;
  const node = { heatLossWPerK: heatLoss(inputs).totalWPerK, heatCapacityWhPerK: inputs.heatCapacityWhPerK, outputCapW: Infinity };
  const gains = totalGainsW(inputs, prepared.meanVerticalIrradiance);
  const scheduledKwh = (pattern: HemPattern, airC: number = SCHEDULED_CHECK_AIR_C): number => {
    const heating = new Uint8Array(HOURS_PER_YEAR);
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const weekday = (Math.floor(hour / 24) + THURSDAY) % 7;
      const hours = weekday < 5 && pattern === 'sap' ? SAP_WEEKDAY_HOURS : SAP_WEEKEND_HOURS;
      if (pattern === 'continuous' || hours.includes(hour % 24)) heating[hour] = 1;
    }
    return sum(runThermalNode(node, prepared.outdoorTemperatureC, gains, heatingTargets(heating, airC), airC).spaceHeatKwh);
  };
  return { inputs, continuousKwh, scheduledKwh };
}
