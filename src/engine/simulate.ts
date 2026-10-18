// ABOUT: Runs one house with one heating setup over the 8,760 hours of the typical year
// ABOUT: Returns hourly typed arrays and annual totals for heat, fuel, cost and carbon

import { HOURS_PER_YEAR } from './constants.ts';
import { annualCarbonKg, annualCost, type AnnualCost } from './costCarbon.ts';
import { dailyHotWaterKwh, evenHourly, hourlySpaceHeatKwh, solarGainsW } from './demand.ts';
import { heatLoss, type HeatLoss } from './geometry.ts';
import type { EngineInputs } from './inputs.ts';
import { fuelForHeat } from './supply.ts';
import type { PreparedWeather } from './weather.ts';

/**
 * `gas`: a combi boiler with a gas supply and no hot water cylinder.
 * `heatPump`: an air source heat pump with a hot water cylinder, and no gas supply.
 */
export type Setup = 'gas' | 'heatPump';

export interface HourlyResult {
  spaceHeatKwh: Float64Array;
  /** Hot water heat, including cylinder standing loss for the heat pump. */
  hotWaterKwh: Float64Array;
  /** Space heat plus hot water: the heat the system supplies. */
  heatKwh: Float64Array;
  gasKwh: Float64Array;
  /** Base use plus, for the heat pump, its heating electricity. */
  electricityKwh: Float64Array;
}

export interface AnnualResult {
  spaceHeatKwh: number;
  hotWaterKwh: number;
  heatKwh: number;
  gasKwh: number;
  heatingElectricityKwh: number;
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
}

const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

export function simulate(inputs: EngineInputs, weather: PreparedWeather, setup: Setup): SimulationResult {
  const loss = heatLoss(inputs);
  const spaceHeatKwh = hourlySpaceHeatKwh(
    inputs,
    loss.totalWPerK,
    weather.outdoorTemperatureC,
    solarGainsW(inputs, weather.meanVerticalIrradiance),
  );
  const cylinderLossKwhPerDay = setup === 'heatPump' ? inputs.cylinderStandingLossKwhPerDay : 0;
  const hotWaterKwh = evenHourly(dailyHotWaterKwh(inputs) + cylinderLossKwhPerDay);
  const heatKwh = spaceHeatKwh.map((space, hour) => space + hotWaterKwh[hour]!);

  const baseElectricityKwh = new Float64Array(HOURS_PER_YEAR).fill(inputs.baseElectricityKwhPerYear / HOURS_PER_YEAR);
  let gasKwh: Float64Array;
  let heatingElectricityKwh: Float64Array;
  if (setup === 'gas') {
    gasKwh = fuelForHeat(heatKwh, inputs.boilerSeasonalEfficiency);
    heatingElectricityKwh = new Float64Array(HOURS_PER_YEAR);
  } else {
    gasKwh = new Float64Array(HOURS_PER_YEAR);
    heatingElectricityKwh = fuelForHeat(heatKwh, inputs.heatPumpSpf);
  }
  const electricityKwh = heatingElectricityKwh.map((heating, hour) => heating + baseElectricityKwh[hour]!);

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
      baseElectricityKwh: sum(baseElectricityKwh),
      electricityKwh: fuel.electricityKwh,
      cost: annualCost(fuel, inputs),
      carbonKg: annualCarbonKg(fuel, inputs),
    },
  };
}
