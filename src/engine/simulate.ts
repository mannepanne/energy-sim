// ABOUT: Runs one house with one heating setup, with or without roof solar, on one electricity tariff, over the 8,760 hours of the typical year
// ABOUT: Runs of one set of inputs share a basis, so the heat side is computed once for every solar and tariff choice that leaves it unchanged

import { expandDaily, REFERENCE_CALENDAR } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { heatingTargets } from './control.ts';
import { annualCarbonKg, annualCost, type AnnualCost } from './costCarbon.ts';
import { runCylinder } from './cylinder.ts';
import { dailyHotWaterKwh, totalGainsW } from './demand.ts';
import { heatLoss, type HeatLoss } from './geometry.ts';
import { compensatedFlowC, copShape, heatPumpElectricityParts, solveCopScale, type CopScale, type HeatPumpLoad } from './heatPump.ts';
import type { EngineInputs } from './inputs.ts';
import { pvGenerationKwh, useSolar } from './pv.ts';
import { planeIrradiance } from './solar.ts';
import { auxiliaryElectricity, baseElectricityKwh, fuelForHeat } from './supply.ts';
import { capTariff, importUnitPence, type ElectricityTariff, type Tariff } from './tariffs.ts';
import { heatingHours, runThermalNode, type ThermalYear } from './thermal.ts';
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
  /** The heat pump's electricity (space heating, cylinder reheats and standby); zero for the gas setups. */
  heatingElectricityKwh: Float64Array;
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
  /** The electricity tariff; gas is always on the price cap. */
  tariff: Tariff;
  /** Whether the control rules moved the heat pump's running: a heat pump on a tariff with cheap and peak hours. */
  controlled: boolean;
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
   * When absent, k is solved here on that reference run. Solar, the tariff and control do not change k.
   */
  copScale?: CopScale;
  /** Adds roof solar, sized by `inputs.pv`. Defaults to false. */
  solar?: boolean;
  /**
   * The roof's generation, from `solarGeneration(inputs, weather)` on the same inputs, so setups sharing one roof
   * in a sample compute it once. Computed here when absent.
   */
  generationKwh?: Float64Array;
  /** The electricity tariff. Defaults to the price cap from the inputs. Gas is always on the price cap. */
  tariff?: ElectricityTariff;
  /**
   * Whether the heat pump follows the control rules on a tariff with cheap and peak hours. Defaults to true. The
   * rules act only on those hours, so on the price cap they change nothing, and the gas setups have no control.
   */
  control?: boolean;
}

function sum(values: Float64Array): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index]!;
  return total;
}

/** The heat pump's output cap: the design heat loss (H × the design temperature difference) × the margin. */
export function heatPumpOutputCapW(inputs: EngineInputs, heatLossWPerK: number): number {
  return heatLossWPerK * inputs.designTemperatureDifferenceK * inputs.heatPumpOutputMargin;
}

/** Roof solar generation for the inputs' PV system, on the roof's sampled direction. */
export function solarGeneration(inputs: EngineInputs, weather: PreparedWeather): Float64Array {
  const onRoof = planeIrradiance(weather.irradiance, weather.sunPath, inputs.pv, inputs.groundReflectance);
  const airC = weather.outdoorTemperatureC.map((temperature) => temperature + inputs.outdoorTemperatureOffsetK);
  return pvGenerationKwh(onRoof, airC, inputs.pv);
}

/**
 * What every run of one set of inputs shares. Parts that only some runs need (the COP shapes, thermal years,
 * cylinder runs and the COP scale) are computed on first use and kept.
 */
export interface RunBasis {
  inputs: EngineInputs;
  weather: PreparedWeather;
  loss: HeatLoss;
  outdoorC: Float64Array;
  gainsW: Float64Array;
  /** Hot water drawn at the taps each hour. */
  drawKwh: Float64Array;
  baseKwh: Float64Array;
  memo: {
    shapes?: Pick<HeatPumpLoad, 'spaceShape' | 'hotWaterShape'>;
    copScale?: CopScale;
    generationKwh?: Float64Array;
    thermal: Map<string, ThermalYear>;
    cylinder: Map<string, Float64Array>;
  };
}

export function runBasis(inputs: EngineInputs, weather: PreparedWeather): RunBasis {
  const loss = heatLoss(inputs);
  const outdoorC = weather.outdoorTemperatureC.map((temperature) => temperature + inputs.outdoorTemperatureOffsetK);
  const drawPerDay = dailyHotWaterKwh(inputs);
  return {
    inputs,
    weather,
    loss,
    outdoorC,
    gainsW: totalGainsW(inputs, weather.meanVerticalIrradiance),
    drawKwh: expandDaily(inputs.hotWaterDrawProfile, REFERENCE_CALENDAR).map((share) => share * drawPerDay),
    baseKwh: baseElectricityKwh(inputs, REFERENCE_CALENDAR),
    memo: { thermal: new Map(), cylinder: new Map() },
  };
}

/** The roof's generation for this basis, computed once. */
export function basisGeneration(basis: RunBasis): Float64Array {
  basis.memo.generationKwh ??= solarGeneration(basis.inputs, basis.weather);
  return basis.memo.generationKwh;
}

/** The COP curve's shape each hour: space heating at the compensated flow, cylinder reheats at the hot water flow. */
function copShapes(basis: RunBasis): Pick<HeatPumpLoad, 'spaceShape' | 'hotWaterShape'> {
  if (!basis.memo.shapes) {
    const { inputs, outdoorC } = basis;
    const spaceShape = new Float64Array(HOURS_PER_YEAR);
    const hotWaterShape = new Float64Array(HOURS_PER_YEAR);
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const outdoor = outdoorC[hour]!;
      spaceShape[hour] = copShape(compensatedFlowC(outdoor, inputs.compensation), outdoor, inputs.copCurve);
      hotWaterShape[hour] = copShape(inputs.hotWaterFlowTemperatureC, outdoor, inputs.copCurve);
    }
    basis.memo.shapes = { spaceShape, hotWaterShape };
  }
  return basis.memo.shapes;
}

const outputCapOf = (basis: RunBasis, heating: Heating): number =>
  heating === 'gas' ? basis.inputs.boilerOutputCapW : heatPumpOutputCapW(basis.inputs, basis.loss.totalWPerK);

const sameSchedule = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * The thermal year for a heating system on a schedule, under control on a tariff or not. A heat pump on the gas
 * schedule is the reference run for k. Kept by tariff name: every tariff a basis meets is built from its inputs,
 * so there is one of each name.
 */
function thermalYear(basis: RunBasis, heating: Heating, schedule: 'gas' | 'heatPump', controlTariff: ElectricityTariff | undefined): ThermalYear {
  const { inputs } = basis;
  const values = schedule === 'gas' ? inputs.gasSchedule : inputs.heatPumpSchedule;
  // A heat pump on its own schedule that matches the gas one is the same run.
  const scheduleKey = sameSchedule(inputs.heatPumpSchedule, inputs.gasSchedule) ? 'gas' : schedule;
  const key = `${heating}|${scheduleKey}|${controlTariff?.tariff ?? 'none'}`;
  let year = basis.memo.thermal.get(key);
  if (!year) {
    const node = { heatLossWPerK: basis.loss.totalWPerK, heatCapacityWhPerK: inputs.heatCapacityWhPerK, outputCapW: outputCapOf(basis, heating) };
    const targets = heatingTargets(heatingHours(values, REFERENCE_CALENDAR), inputs.setpointC, controlTariff?.band, controlTariff && inputs.control);
    year = runThermalNode(node, basis.outdoorC, basis.gainsW, targets, inputs.setpointC);
    basis.memo.thermal.set(key, year);
  }
  return year;
}

/** The heat pump's cylinder reheats, under control on a tariff or not. */
function cylinderReheats(basis: RunBasis, controlTariff: ElectricityTariff | undefined): Float64Array {
  const key = controlTariff?.tariff ?? 'none';
  let reheatKwh = basis.memo.cylinder.get(key);
  if (!reheatKwh) {
    const { inputs } = basis;
    const cylinder = {
      volumeLitres: inputs.cylinderVolumeLitres,
      setpointC: inputs.cylinderSetpointC,
      minimumC: inputs.cylinderMinimumC,
      coldFeedC: inputs.coldFeedTemperatureC,
      standingLossKwhPerDay: inputs.cylinderStandingLossKwhPerDay,
    };
    reheatKwh = runCylinder(basis.drawKwh, cylinder, controlTariff?.band).reheatKwh;
    basis.memo.cylinder.set(key, reheatKwh);
  }
  return reheatKwh;
}

/**
 * k for this basis, solved on the reference run: the heat pump, with its own cap, on the gas setups' schedule, on
 * the price cap with no control, so its cylinder reheats whenever it falls below its minimum.
 */
export function referenceCopScale(basis: RunBasis): CopScale {
  if (!basis.memo.copScale) {
    const { inputs } = basis;
    const load: HeatPumpLoad = {
      spaceHeatKwh: thermalYear(basis, 'heatPump', 'gas', undefined).spaceHeatKwh,
      hotWaterHeatKwh: cylinderReheats(basis, undefined),
      ...copShapes(basis),
    };
    basis.memo.copScale = solveCopScale(load, inputs.heatPumpSpf, inputs.copCurve, inputs.heatPumpStandbyShare);
  }
  return basis.memo.copScale;
}

/** The heating system's side of a run: everything but solar and the tariff's prices. */
export interface HeatSide {
  heating: Heating;
  controlled: boolean;
  outputCapW: number;
  thermal: ThermalYear;
  hotWaterKwh: Float64Array;
  gasKwh: Float64Array;
  heatingElectricityKwh: Float64Array;
  auxiliaryElectricityKwh: Float64Array;
  /** The heat pump's space heating and standby, or the boiler's pump and fan: the load solar meets after base use. */
  heatingLoadKwh: Float64Array;
  /** The heat pump's cylinder reheats; zero for the combi. */
  cylinderLoadKwh: Float64Array;
  copScale?: CopScale;
}

/** The combi heats the draw-off as it is drawn; its pump and fan run in proportion to its gas use. */
function gasSide(basis: RunBasis): HeatSide {
  const thermal = thermalYear(basis, 'gas', 'gas', undefined);
  const gasKwh = fuelForHeat(
    thermal.spaceHeatKwh.map((space, hour) => space + basis.drawKwh[hour]!),
    basis.inputs.boilerSeasonalEfficiency,
  );
  const auxiliaryElectricityKwh = auxiliaryElectricity(gasKwh, basis.inputs.boilerAuxiliaryElectricityKwhPerYear);
  return {
    heating: 'gas',
    controlled: false,
    outputCapW: outputCapOf(basis, 'gas'),
    thermal,
    hotWaterKwh: basis.drawKwh,
    gasKwh,
    heatingElectricityKwh: new Float64Array(HOURS_PER_YEAR),
    auxiliaryElectricityKwh,
    heatingLoadKwh: auxiliaryElectricityKwh,
    cylinderLoadKwh: new Float64Array(HOURS_PER_YEAR),
  };
}

/** The heat pump reheats its cylinder and heats the house through the COP curve at scale k. */
function heatPumpSide(basis: RunBasis, controlTariff: ElectricityTariff | undefined, copScale: CopScale): HeatSide {
  const thermal = thermalYear(basis, 'heatPump', 'heatPump', controlTariff);
  const hotWaterKwh = cylinderReheats(basis, controlTariff);
  const load: HeatPumpLoad = { spaceHeatKwh: thermal.spaceHeatKwh, hotWaterHeatKwh: hotWaterKwh, ...copShapes(basis) };
  const electricity = heatPumpElectricityParts(load, copScale, basis.inputs.copCurve);
  return {
    heating: 'heatPump',
    controlled: controlTariff !== undefined,
    outputCapW: outputCapOf(basis, 'heatPump'),
    thermal,
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

/**
 * The heat side of a run. Control applies to the heat pump on a tariff with cheap or peak hours; `copScale`
 * defaults to the reference run's.
 */
export function heatSide(basis: RunBasis, heating: Heating, tariff: ElectricityTariff, control = true, copScale?: CopScale): HeatSide {
  if (heating === 'gas') return gasSide(basis);
  const controlTariff = control && tariff.hasBands ? tariff : undefined;
  return heatPumpSide(basis, controlTariff, copScale ?? referenceCopScale(basis));
}

/**
 * Adds base use, solar and the tariff's prices to a heat side. Runs once per combination, so its hourly work is
 * one loop that builds the hourly arrays and the year's sums together.
 */
export function completeRun(basis: RunBasis, heat: HeatSide, tariff: ElectricityTariff, solar: boolean, givenGenerationKwh?: Float64Array): SimulationResult {
  const { inputs, baseKwh } = basis;
  const { hotWaterKwh, gasKwh, heatingElectricityKwh, auxiliaryElectricityKwh, copScale } = heat;
  const spaceHeatKwh = heat.thermal.spaceHeatKwh;
  const heatKwh = new Float64Array(HOURS_PER_YEAR);
  const electricityKwh = new Float64Array(HOURS_PER_YEAR);
  const totals = { space: 0, hotWater: 0, heat: 0, gas: 0, heatingElectricity: 0, auxiliary: 0, base: 0, electricity: 0 };
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const space = spaceHeatKwh[hour]!;
    const hotWater = hotWaterKwh[hour]!;
    const heating = heatingElectricityKwh[hour]!;
    const auxiliary = auxiliaryElectricityKwh[hour]!;
    const base = baseKwh[hour]!;
    heatKwh[hour] = space + hotWater;
    electricityKwh[hour] = heating + auxiliary + base;
    totals.space += space;
    totals.hotWater += hotWater;
    totals.heat += space + hotWater;
    totals.gas += gasKwh[hour]!;
    totals.heatingElectricity += heating;
    totals.auxiliary += auxiliary;
    totals.base += base;
    totals.electricity += heating + auxiliary + base;
  }

  let generationKwh: Float64Array = new Float64Array(HOURS_PER_YEAR);
  let importKwh: Float64Array = electricityKwh;
  let exportKwh: Float64Array = new Float64Array(HOURS_PER_YEAR);
  let solarUsedBy: SolarUsedBy = { baseKwh: 0, heatingKwh: 0, cylinderKwh: 0 };
  let annualGeneration = 0;
  let annualExport = 0;
  let annualImport = totals.electricity;
  if (solar) {
    generationKwh = givenGenerationKwh ?? basisGeneration(basis);
    const use = useSolar(generationKwh, { baseKwh, heatingKwh: heat.heatingLoadKwh, cylinderKwh: heat.cylinderLoadKwh });
    importKwh = use.importKwh;
    exportKwh = use.exportKwh;
    solarUsedBy = { baseKwh: use.usedByBaseKwh, heatingKwh: use.usedByHeatingKwh, cylinderKwh: use.usedByCylinderKwh };
    annualGeneration = sum(generationKwh);
    annualExport = sum(exportKwh);
    annualImport = sum(importKwh);
  }

  const fuel = { gasKwh: totals.gas, electricityKwh: annualImport, exportKwh: annualExport, hasGasSupply: heat.heating === 'gas' };
  const charges = { unitPence: importUnitPence(importKwh, tariff), standingChargePencePerDay: tariff.standingChargePencePerDay };
  return {
    heating: heat.heating,
    solar,
    tariff: tariff.tariff,
    controlled: heat.controlled,
    pvPeakPowerKw: solar ? inputs.pv.peakPowerKw : 0,
    heatLoss: basis.loss,
    outputCapW: heat.outputCapW,
    hourly: {
      spaceHeatKwh,
      internalTemperatureC: heat.thermal.internalTemperatureC,
      hotWaterKwh,
      heatKwh,
      gasKwh,
      heatingElectricityKwh,
      electricityKwh,
      generationKwh,
      importKwh,
      exportKwh,
    },
    annual: {
      spaceHeatKwh: totals.space,
      hotWaterKwh: totals.hotWater,
      heatKwh: totals.heat,
      gasKwh: totals.gas,
      heatingElectricityKwh: totals.heatingElectricity,
      auxiliaryElectricityKwh: totals.auxiliary,
      baseElectricityKwh: totals.base,
      electricityKwh: totals.electricity,
      generationKwh: annualGeneration,
      selfConsumedKwh: annualGeneration - annualExport,
      solarUsedBy,
      importKwh: annualImport,
      exportKwh: annualExport,
      cost: annualCost(fuel, inputs, charges),
      carbonKg: annualCarbonKg(fuel, inputs),
    },
    ...(copScale && { copScale }),
  };
}

export function simulate(inputs: EngineInputs, weather: PreparedWeather, heating: Heating, options: SimulateOptions = {}): SimulationResult {
  const basis = runBasis(inputs, weather);
  const tariff = options.tariff ?? capTariff(inputs);
  const heat = heatSide(basis, heating, tariff, options.control ?? true, options.copScale);
  return completeRun(basis, heat, tariff, options.solar ?? false, options.generationKwh);
}
