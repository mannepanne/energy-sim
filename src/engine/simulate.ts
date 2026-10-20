// ABOUT: Runs one house with one heating setup, with or without roof solar, over the 8,760 hours of the typical year
// ABOUT: Returns hourly typed arrays and annual totals for heat, fuel, solar, import, export, cost and carbon, and the COP scale

import { buildCalendar, expandDaily, expandWeekly } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { annualCarbonKg, annualCost, type AnnualCost } from './costCarbon.ts';
import { runCylinder } from './cylinder.ts';
import { dailyHotWaterKwh, totalGainsW } from './demand.ts';
import { heatLoss, type HeatLoss } from './geometry.ts';
import { compensatedFlowC, copShape, heatPumpElectricityParts, solveCopScale, type CopScale, type HeatPumpLoad } from './heatPump.ts';
import type { EngineInputs } from './inputs.ts';
import { pvGenerationKwh, useSolar } from './pv.ts';
import { planeIrradiance } from './solar.ts';
import { auxiliaryElectricity, baseElectricityKwh, fuelForHeat } from './supply.ts';
import { hourlySetpoints, runThermalNode } from './thermal.ts';
import type { PreparedWeather } from './weather.ts';

/**
 * The heating system. `gas`: a combi boiler with a gas supply and no hot water cylinder.
 * `heatPump`: an air source heat pump with a hot water cylinder, and no gas supply.
 * Either may have roof solar (`SimulateOptions.solar`); `setups.ts` names the four combinations.
 */
export type Heating = 'gas' | 'heatPump';

export interface HourlyResult {
  spaceHeatKwh: Float64Array;
  /** The thermal node's temperature at the end of each hour. */
  internalTemperatureC: Float64Array;
  /** Hot water heat the system supplies: the draw-off for the combi, the cylinder's reheats for the heat pump. */
  hotWaterKwh: Float64Array;
  /** Space heat plus hot water: the heat the system supplies. */
  heatKwh: Float64Array;
  gasKwh: Float64Array;
  /** Base use plus the heat pump's heating electricity or the boiler's pump and fan electricity. */
  electricityKwh: Float64Array;
  /** AC generation from roof solar; zero without solar. */
  generationKwh: Float64Array;
  /** Electricity bought from the grid: the electricity solar did not meet. */
  importKwh: Float64Array;
  /** Generation the house did not use. */
  exportKwh: Float64Array;
}

/** Which load the year's used generation met, in the order solar meets them. */
export interface SolarUsedBy {
  baseKwh: number;
  /** The heat pump's space heating and standby, or the boiler's pump and fan. */
  heatingKwh: number;
  /** The heat pump's cylinder reheats. */
  cylinderKwh: number;
}

export interface AnnualResult {
  spaceHeatKwh: number;
  hotWaterKwh: number;
  heatKwh: number;
  gasKwh: number;
  heatingElectricityKwh: number;
  /** The boiler's pump and fan; zero for the heat pump. */
  auxiliaryElectricityKwh: number;
  baseElectricityKwh: number;
  /** Electricity the house uses, from solar or the grid. */
  electricityKwh: number;
  generationKwh: number;
  /** Generation the house used: generation minus export. */
  selfConsumedKwh: number;
  solarUsedBy: SolarUsedBy;
  importKwh: number;
  exportKwh: number;
  /** Imports, less export income at the flat export rate. */
  cost: AnnualCost;
  /** Imported electricity and gas only: export earns no carbon credit. */
  carbonKg: number;
}

export interface SimulationResult {
  heating: Heating;
  solar: boolean;
  /** The PV system's size after the roof limit; zero without solar. */
  pvPeakPowerKw: number;
  heatLoss: HeatLoss;
  /** The heating system's space heating output cap, W. */
  outputCapW: number;
  hourly: HourlyResult;
  annual: AnnualResult;
  /** The heat pump's COP scale, as used on this run. Absent for the gas setup. */
  copScale?: CopScale;
}

export interface SimulateOptions {
  /**
   * The heat pump's COP scale from the reference run: price cap, no control, on the gas setups' heating schedule.
   * When absent, k is solved here on that reference run. A caller that applies control or a time-of-use tariff
   * must pass the reference run's scale. Solar does not change the heat the heat pump delivers, so it does not
   * change k.
   */
  copScale?: CopScale;
  /** Adds roof solar, sized by `inputs.pv`. Defaults to false. */
  solar?: boolean;
  /**
   * The roof's generation, from `solarGeneration(inputs, weather)` on the same inputs, so setups sharing one roof
   * in a sample compute it once. Computed here when absent.
   */
  generationKwh?: Float64Array;
}

/** The time base for local-time profiles, built once: it depends only on the reference year. */
const CALENDAR = buildCalendar();

const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

/** The COP curve's shape each hour: space heating at the compensated flow, cylinder reheats at the hot water flow. */
function copShapes(inputs: EngineInputs, outdoorC: Float64Array): Pick<HeatPumpLoad, 'spaceShape' | 'hotWaterShape'> {
  const spaceShape = new Float64Array(HOURS_PER_YEAR);
  const hotWaterShape = new Float64Array(HOURS_PER_YEAR);
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const outdoor = outdoorC[hour]!;
    spaceShape[hour] = copShape(compensatedFlowC(outdoor, inputs.compensation), outdoor, inputs.copCurve);
    hotWaterShape[hour] = copShape(inputs.hotWaterFlowTemperatureC, outdoor, inputs.copCurve);
  }
  return { spaceShape, hotWaterShape };
}

/** The heat pump's output cap: the design heat loss (H × the design temperature difference) × the margin. */
export function heatPumpOutputCapW(inputs: EngineInputs, heatLossWPerK: number): number {
  return heatLossWPerK * inputs.designTemperatureDifferenceK * inputs.heatPumpOutputMargin;
}

/** What the thermal node needs from a run that is the same for every schedule and cap. */
interface SpaceHeatContext {
  inputs: EngineInputs;
  heatLossWPerK: number;
  outdoorC: Float64Array;
  gainsW: Float64Array;
}

/** Space heat each hour on a heating schedule, at the inputs' setpoint, up to an output cap. */
function spaceHeatOn(context: SpaceHeatContext, schedule: readonly number[], outputCapW: number) {
  const { inputs } = context;
  const node = { heatLossWPerK: context.heatLossWPerK, heatCapacityWhPerK: inputs.heatCapacityWhPerK, outputCapW };
  const setpoints = hourlySetpoints(expandWeekly(schedule, CALENDAR), inputs.setpointC);
  return runThermalNode(node, context.outdoorC, context.gainsW, setpoints, inputs.setpointC);
}

const sameSchedule = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Roof solar generation for the inputs' PV system, on the roof's sampled direction. */
export function solarGeneration(inputs: EngineInputs, weather: PreparedWeather): Float64Array {
  const onRoof = planeIrradiance(weather.irradiance, weather.sunPath, inputs.pv, inputs.groundReflectance);
  const airC = weather.outdoorTemperatureC.map((temperature) => temperature + inputs.outdoorTemperatureOffsetK);
  return pvGenerationKwh(onRoof, airC, inputs.pv);
}

/** What a heating setup supplies over the year, and the electricity loads solar meets after base use. */
interface Supply {
  hotWaterKwh: Float64Array;
  gasKwh: Float64Array;
  heatingElectricityKwh: Float64Array;
  auxiliaryElectricityKwh: Float64Array;
  /** The heat pump's space heating and standby, or the boiler's pump and fan. */
  heatingLoadKwh: Float64Array;
  /** The heat pump's cylinder reheats; zero for the combi. */
  cylinderLoadKwh: Float64Array;
  copScale?: CopScale;
}

/** The combi heats the draw-off as it is drawn; its pump and fan run in proportion to its gas use. */
function gasSupply(inputs: EngineInputs, spaceHeatKwh: Float64Array, drawKwh: Float64Array): Supply {
  const gasKwh = fuelForHeat(
    spaceHeatKwh.map((space, hour) => space + drawKwh[hour]!),
    inputs.boilerSeasonalEfficiency,
  );
  const auxiliaryElectricityKwh = auxiliaryElectricity(gasKwh, inputs.boilerAuxiliaryElectricityKwhPerYear);
  return {
    hotWaterKwh: drawKwh,
    gasKwh,
    heatingElectricityKwh: new Float64Array(HOURS_PER_YEAR),
    auxiliaryElectricityKwh,
    heatingLoadKwh: auxiliaryElectricityKwh,
    cylinderLoadKwh: new Float64Array(HOURS_PER_YEAR),
  };
}

/**
 * The heat pump reheats its cylinder and heats the house through the COP curve, at the given k or one solved on the
 * reference run, whose space heat is `referenceSpaceHeatKwh()`.
 */
function heatPumpSupply(
  inputs: EngineInputs,
  outdoorC: Float64Array,
  spaceHeatKwh: Float64Array,
  referenceSpaceHeatKwh: () => Float64Array,
  drawKwh: Float64Array,
  givenScale: CopScale | undefined,
): Supply {
  const hotWaterKwh = runCylinder(drawKwh, {
    volumeLitres: inputs.cylinderVolumeLitres,
    setpointC: inputs.cylinderSetpointC,
    minimumC: inputs.cylinderMinimumC,
    coldFeedC: inputs.coldFeedTemperatureC,
    standingLossKwhPerDay: inputs.cylinderStandingLossKwhPerDay,
  }).reheatKwh;
  const shapes = copShapes(inputs, outdoorC);
  const load: HeatPumpLoad = { spaceHeatKwh, hotWaterHeatKwh: hotWaterKwh, ...shapes };
  const copScale =
    givenScale ??
    solveCopScale({ ...load, spaceHeatKwh: referenceSpaceHeatKwh() }, inputs.heatPumpSpf, inputs.copCurve, inputs.heatPumpStandbyShare);
  const electricity = heatPumpElectricityParts(load, copScale, inputs.copCurve);
  return {
    hotWaterKwh,
    gasKwh: new Float64Array(HOURS_PER_YEAR),
    heatingElectricityKwh: electricity.totalKwh,
    auxiliaryElectricityKwh: new Float64Array(HOURS_PER_YEAR),
    // Standby runs whether or not the heat pump is heating, so solar meets it with space heating, before the cylinder.
    heatingLoadKwh: electricity.spaceKwh.map((space) => space + electricity.standbyKwhPerHour),
    cylinderLoadKwh: electricity.hotWaterKwh,
    copScale,
  };
}

export function simulate(inputs: EngineInputs, weather: PreparedWeather, heating: Heating, options: SimulateOptions = {}): SimulationResult {
  const solar = options.solar ?? false;
  const loss = heatLoss(inputs);
  const outdoorC = weather.outdoorTemperatureC.map((temperature) => temperature + inputs.outdoorTemperatureOffsetK);
  const context: SpaceHeatContext = {
    inputs,
    heatLossWPerK: loss.totalWPerK,
    outdoorC,
    gainsW: totalGainsW(inputs, weather.meanVerticalIrradiance),
  };
  const outputCapW = heating === 'gas' ? inputs.boilerOutputCapW : heatPumpOutputCapW(inputs, loss.totalWPerK);
  const schedule = heating === 'gas' ? inputs.gasSchedule : inputs.heatPumpSchedule;
  const thermal = spaceHeatOn(context, schedule, outputCapW);
  const spaceHeatKwh = thermal.spaceHeatKwh;
  const drawPerDay = dailyHotWaterKwh(inputs);
  const drawKwh = expandDaily(inputs.hotWaterDrawProfile, CALENDAR).map((share) => share * drawPerDay);

  // The reference run for k: the heat pump, with its own cap, on the gas setups' schedule.
  const referenceSpaceHeatKwh = (): Float64Array =>
    sameSchedule(inputs.heatPumpSchedule, inputs.gasSchedule) ? spaceHeatKwh : spaceHeatOn(context, inputs.gasSchedule, outputCapW).spaceHeatKwh;
  const baseKwh = baseElectricityKwh(inputs, CALENDAR);
  const supply =
    heating === 'gas'
      ? gasSupply(inputs, spaceHeatKwh, drawKwh)
      : heatPumpSupply(inputs, outdoorC, spaceHeatKwh, referenceSpaceHeatKwh, drawKwh, options.copScale);
  const { hotWaterKwh, gasKwh, heatingElectricityKwh, auxiliaryElectricityKwh, copScale } = supply;
  const heatKwh = spaceHeatKwh.map((space, hour) => space + hotWaterKwh[hour]!);
  const electricityKwh = heatingElectricityKwh.map((heatingKwh, hour) => heatingKwh + auxiliaryElectricityKwh[hour]! + baseKwh[hour]!);

  let generationKwh: Float64Array = new Float64Array(HOURS_PER_YEAR);
  let importKwh: Float64Array = electricityKwh;
  let exportKwh: Float64Array = new Float64Array(HOURS_PER_YEAR);
  let solarUsedBy: SolarUsedBy = { baseKwh: 0, heatingKwh: 0, cylinderKwh: 0 };
  if (solar) {
    generationKwh = options.generationKwh ?? solarGeneration(inputs, weather);
    const use = useSolar(generationKwh, { baseKwh, heatingKwh: supply.heatingLoadKwh, cylinderKwh: supply.cylinderLoadKwh });
    importKwh = use.importKwh;
    exportKwh = use.exportKwh;
    solarUsedBy = { baseKwh: use.usedByBaseKwh, heatingKwh: use.usedByHeatingKwh, cylinderKwh: use.usedByCylinderKwh };
  }

  const annualGeneration = sum(generationKwh);
  const annualExport = sum(exportKwh);
  const fuel = { gasKwh: sum(gasKwh), electricityKwh: sum(importKwh), exportKwh: annualExport, hasGasSupply: heating === 'gas' };
  return {
    heating,
    solar,
    pvPeakPowerKw: solar ? inputs.pv.peakPowerKw : 0,
    heatLoss: loss,
    outputCapW,
    hourly: { spaceHeatKwh, internalTemperatureC: thermal.internalTemperatureC, hotWaterKwh, heatKwh, gasKwh, electricityKwh, generationKwh, importKwh, exportKwh },
    annual: {
      spaceHeatKwh: sum(spaceHeatKwh),
      hotWaterKwh: sum(hotWaterKwh),
      heatKwh: sum(heatKwh),
      gasKwh: fuel.gasKwh,
      heatingElectricityKwh: sum(heatingElectricityKwh),
      auxiliaryElectricityKwh: sum(auxiliaryElectricityKwh),
      baseElectricityKwh: sum(baseKwh),
      electricityKwh: sum(electricityKwh),
      generationKwh: annualGeneration,
      selfConsumedKwh: annualGeneration - annualExport,
      solarUsedBy,
      importKwh: fuel.electricityKwh,
      exportKwh: annualExport,
      cost: annualCost(fuel, inputs),
      carbonKg: annualCarbonKg(fuel, inputs),
    },
    ...(copScale && { copScale }),
  };
}
