// ABOUT: Runs one house with one heating setup, with or without roof solar, over the 8,760 hours of the typical year
// ABOUT: Returns hourly typed arrays and annual totals for heat, fuel, solar, import, export, cost and carbon, and the COP scale

import { buildCalendar, expandDaily } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { annualCarbonKg, annualCost, type AnnualCost } from './costCarbon.ts';
import { runCylinder } from './cylinder.ts';
import { dailyHotWaterKwh, hourlySpaceHeatKwh, solarGainsW } from './demand.ts';
import { heatLoss, type HeatLoss } from './geometry.ts';
import { compensatedFlowC, copShape, heatPumpElectricityParts, solveCopScale, type CopScale, type HeatPumpLoad } from './heatPump.ts';
import type { EngineInputs } from './inputs.ts';
import { pvGenerationKwh, useSolar } from './pv.ts';
import { planeIrradiance } from './solar.ts';
import { auxiliaryElectricity, baseElectricityKwh, fuelForHeat } from './supply.ts';
import type { PreparedWeather } from './weather.ts';

/**
 * `gas`: a combi boiler with a gas supply and no hot water cylinder.
 * `heatPump`: an air source heat pump with a hot water cylinder, and no gas supply.
 * Either may have roof solar (`SimulateOptions.solar`).
 */
export type Setup = 'gas' | 'heatPump';

export interface HourlyResult {
  spaceHeatKwh: Float64Array;
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
  /** Imports only: export earns nothing until the export tariff is added. */
  cost: AnnualCost;
  /** Imported electricity and gas only: export earns no carbon credit. */
  carbonKg: number;
}

export interface SimulationResult {
  setup: Setup;
  solar: boolean;
  /** The PV system's size after the roof limit; zero without solar. */
  pvPeakPowerKw: number;
  heatLoss: HeatLoss;
  hourly: HourlyResult;
  annual: AnnualResult;
  /** The heat pump's COP scale, as used on this run. Absent for the gas setup. */
  copScale?: CopScale;
}

export interface SimulateOptions {
  /**
   * The heat pump's COP scale from the reference run (price cap, no control). When absent, k is solved on this run,
   * which is right only when this run is the reference run. A caller that applies control or a time-of-use tariff
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

/** The heat pump's load on this run: space heat at the compensated flow, cylinder reheats at the hot water flow. */
function heatPumpLoad(inputs: EngineInputs, outdoorC: Float64Array, spaceHeatKwh: Float64Array, hotWaterHeatKwh: Float64Array): HeatPumpLoad {
  const spaceShape = new Float64Array(HOURS_PER_YEAR);
  const hotWaterShape = new Float64Array(HOURS_PER_YEAR);
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const outdoor = outdoorC[hour]!;
    spaceShape[hour] = copShape(compensatedFlowC(outdoor, inputs.compensation), outdoor, inputs.copCurve);
    hotWaterShape[hour] = copShape(inputs.hotWaterFlowTemperatureC, outdoor, inputs.copCurve);
  }
  return { spaceHeatKwh, spaceShape, hotWaterHeatKwh, hotWaterShape };
}

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

/** The heat pump reheats its cylinder and heats the house through the COP curve, at the given k or one solved here. */
function heatPumpSupply(
  inputs: EngineInputs,
  weather: PreparedWeather,
  spaceHeatKwh: Float64Array,
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
  const outdoorC = weather.outdoorTemperatureC.map((temperature) => temperature + inputs.outdoorTemperatureOffsetK);
  const load = heatPumpLoad(inputs, outdoorC, spaceHeatKwh, hotWaterKwh);
  const copScale = givenScale ?? solveCopScale(load, inputs.heatPumpSpf, inputs.copCurve, inputs.heatPumpStandbyShare);
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

export function simulate(inputs: EngineInputs, weather: PreparedWeather, setup: Setup, options: SimulateOptions = {}): SimulationResult {
  const solar = options.solar ?? false;
  const loss = heatLoss(inputs);
  const spaceHeatKwh = hourlySpaceHeatKwh(
    inputs,
    loss.totalWPerK,
    weather.outdoorTemperatureC,
    solarGainsW(inputs, weather.meanVerticalIrradiance),
  );
  const drawPerDay = dailyHotWaterKwh(inputs);
  const drawKwh = expandDaily(inputs.hotWaterDrawProfile, CALENDAR).map((share) => share * drawPerDay);

  const baseKwh = baseElectricityKwh(inputs, CALENDAR);
  const supply =
    setup === 'gas' ? gasSupply(inputs, spaceHeatKwh, drawKwh) : heatPumpSupply(inputs, weather, spaceHeatKwh, drawKwh, options.copScale);
  const { hotWaterKwh, gasKwh, heatingElectricityKwh, auxiliaryElectricityKwh, copScale } = supply;
  const heatKwh = spaceHeatKwh.map((space, hour) => space + hotWaterKwh[hour]!);
  const electricityKwh = heatingElectricityKwh.map((heating, hour) => heating + auxiliaryElectricityKwh[hour]! + baseKwh[hour]!);

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
  const fuel = { gasKwh: sum(gasKwh), electricityKwh: sum(importKwh), hasGasSupply: setup === 'gas' };
  return {
    setup,
    solar,
    pvPeakPowerKw: solar ? inputs.pv.peakPowerKw : 0,
    heatLoss: loss,
    hourly: { spaceHeatKwh, hotWaterKwh, heatKwh, gasKwh, electricityKwh, generationKwh, importKwh, exportKwh },
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
