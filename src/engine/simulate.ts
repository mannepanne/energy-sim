// ABOUT: Runs one house with one heating setup over the 8,760 hours of the typical year
// ABOUT: Returns hourly typed arrays and annual totals for heat, fuel, cost and carbon, and the heat pump's COP scale

import { buildCalendar, expandDaily } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { annualCarbonKg, annualCost, type AnnualCost } from './costCarbon.ts';
import { runCylinder } from './cylinder.ts';
import { dailyHotWaterKwh, hourlySpaceHeatKwh, solarGainsW } from './demand.ts';
import { heatLoss, type HeatLoss } from './geometry.ts';
import { compensatedFlowC, copShape, heatPumpElectricity, solveCopScale, type CopScale, type HeatPumpLoad } from './heatPump.ts';
import type { EngineInputs } from './inputs.ts';
import { auxiliaryElectricity, fuelForHeat } from './supply.ts';
import type { PreparedWeather } from './weather.ts';

/**
 * `gas`: a combi boiler with a gas supply and no hot water cylinder.
 * `heatPump`: an air source heat pump with a hot water cylinder, and no gas supply.
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
  electricityKwh: number;
  cost: AnnualCost;
  carbonKg: number;
}

export interface SimulationResult {
  setup: Setup;
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
   * must pass the reference run's scale.
   */
  copScale?: CopScale;
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

export function simulate(inputs: EngineInputs, weather: PreparedWeather, setup: Setup, options: SimulateOptions = {}): SimulationResult {
  const loss = heatLoss(inputs);
  const spaceHeatKwh = hourlySpaceHeatKwh(
    inputs,
    loss.totalWPerK,
    weather.outdoorTemperatureC,
    solarGainsW(inputs, weather.meanVerticalIrradiance),
  );
  const drawPerDay = dailyHotWaterKwh(inputs);
  const drawKwh = expandDaily(inputs.hotWaterDrawProfile, CALENDAR).map((share) => share * drawPerDay);

  const baseElectricityKwh = new Float64Array(HOURS_PER_YEAR).fill(inputs.baseElectricityKwhPerYear / HOURS_PER_YEAR);
  let hotWaterKwh: Float64Array;
  let gasKwh: Float64Array;
  let heatingElectricityKwh: Float64Array;
  let auxiliaryElectricityKwh: Float64Array;
  let copScale: CopScale | undefined;
  if (setup === 'gas') {
    hotWaterKwh = drawKwh;
    gasKwh = fuelForHeat(
      spaceHeatKwh.map((space, hour) => space + hotWaterKwh[hour]!),
      inputs.boilerSeasonalEfficiency,
    );
    heatingElectricityKwh = new Float64Array(HOURS_PER_YEAR);
    auxiliaryElectricityKwh = auxiliaryElectricity(gasKwh, inputs.boilerAuxiliaryElectricityKwhPerYear);
  } else {
    hotWaterKwh = runCylinder(drawKwh, {
      volumeLitres: inputs.cylinderVolumeLitres,
      setpointC: inputs.cylinderSetpointC,
      minimumC: inputs.cylinderMinimumC,
      coldFeedC: inputs.coldFeedTemperatureC,
      standingLossKwhPerDay: inputs.cylinderStandingLossKwhPerDay,
    }).reheatKwh;
    const outdoorC = weather.outdoorTemperatureC.map((temperature) => temperature + inputs.outdoorTemperatureOffsetK);
    const load = heatPumpLoad(inputs, outdoorC, spaceHeatKwh, hotWaterKwh);
    copScale = options.copScale ?? solveCopScale(load, inputs.heatPumpSpf, inputs.copCurve);
    gasKwh = new Float64Array(HOURS_PER_YEAR);
    heatingElectricityKwh = heatPumpElectricity(load, copScale, inputs.copCurve);
    auxiliaryElectricityKwh = new Float64Array(HOURS_PER_YEAR);
  }
  const heatKwh = spaceHeatKwh.map((space, hour) => space + hotWaterKwh[hour]!);
  const electricityKwh = heatingElectricityKwh.map((heating, hour) => heating + auxiliaryElectricityKwh[hour]! + baseElectricityKwh[hour]!);

  const fuel = { gasKwh: sum(gasKwh), electricityKwh: sum(electricityKwh), hasGasSupply: setup === 'gas' };
  return {
    setup,
    heatLoss: loss,
    hourly: { spaceHeatKwh, hotWaterKwh, heatKwh, gasKwh, electricityKwh },
    annual: {
      spaceHeatKwh: sum(spaceHeatKwh),
      hotWaterKwh: sum(hotWaterKwh),
      heatKwh: sum(heatKwh),
      gasKwh: fuel.gasKwh,
      heatingElectricityKwh: sum(heatingElectricityKwh),
      auxiliaryElectricityKwh: sum(auxiliaryElectricityKwh),
      baseElectricityKwh: sum(baseElectricityKwh),
      electricityKwh: fuel.electricityKwh,
      cost: annualCost(fuel, inputs),
      carbonKg: annualCarbonKg(fuel, inputs),
    },
    ...(copScale && { copScale }),
  };
}
