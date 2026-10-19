// ABOUT: The heat pump's hourly COP: a clamped Carnot-like shape against flow and outdoor temperature, scaled by k
// ABOUT: k is solved on a reference run so the year's heat ÷ electricity equals the sampled SPF, then reused unchanged

import { KELVIN_OFFSET } from './constants.ts';

/** The curve's parameters, from the register. */
export interface CopCurve {
  /** Added to the flow-to-outdoor difference: the heat exchangers' approach temperatures, K. */
  liftAllowanceK: number;
  /** The shape is clamped to [floor, ceiling] before scaling. */
  shapeFloor: number;
  shapeCeiling: number;
  /** The physical ceiling on the scaled COP. */
  copCeiling: number;
}

/** The weather-compensation line: flow temperature at the design and mild outdoor temperatures, flat beyond them. */
export interface CompensationLine {
  designOutdoorC: number;
  designFlowC: number;
  mildOutdoorC: number;
  mildFlowC: number;
}

export function checkCurve(curve: CopCurve): void {
  if (!(curve.liftAllowanceK > 0)) throw new Error(`The COP lift allowance must be positive, got ${curve.liftAllowanceK} K`);
  if (!(curve.shapeFloor > 0 && curve.shapeFloor < curve.shapeCeiling)) {
    throw new Error(`The COP shape clamp needs 0 < floor < ceiling, got ${curve.shapeFloor} and ${curve.shapeCeiling}`);
  }
  if (!(curve.copCeiling > 1)) throw new Error(`The COP ceiling must be above 1, got ${curve.copCeiling}`);
}

export function checkCompensation(line: CompensationLine): void {
  if (!(line.designOutdoorC < line.mildOutdoorC)) {
    throw new Error(`The compensation line's design outdoor temperature (${line.designOutdoorC} °C) must be below its mild one (${line.mildOutdoorC} °C)`);
  }
  if (!(line.designFlowC >= line.mildFlowC)) {
    throw new Error(`The compensation line's design flow temperature (${line.designFlowC} °C) must not be below its mild one (${line.mildFlowC} °C)`);
  }
}

/** The space heating flow temperature for an outdoor temperature: linear between the endpoints, flat outside them. */
export function compensatedFlowC(outdoorC: number, line: CompensationLine): number {
  if (outdoorC <= line.designOutdoorC) return line.designFlowC;
  if (outdoorC >= line.mildOutdoorC) return line.mildFlowC;
  const share = (outdoorC - line.designOutdoorC) / (line.mildOutdoorC - line.designOutdoorC);
  return line.designFlowC + share * (line.mildFlowC - line.designFlowC);
}

/**
 * The unscaled COP shape, (T_flow + 273.15) ÷ (T_flow − T_out + ΔT_lift), clamped to the curve's floor and ceiling.
 * The clamp guards the hours when T_out nears T_flow, where the Carnot-like ratio grows without limit.
 */
export function copShape(flowC: number, outdoorC: number, curve: CopCurve): number {
  const lift = flowC - outdoorC + curve.liftAllowanceK;
  const raw = lift > 0 ? (flowC + KELVIN_OFFSET) / lift : Infinity;
  return Math.min(curve.shapeCeiling, Math.max(curve.shapeFloor, raw));
}

/** The scale factor k, and whether the physical ceiling bound in any hour of the run it was solved on. */
export interface CopScale {
  k: number;
  ceilingBound: boolean;
}

/** Heat delivered in each hour, split by flow temperature, with the COP shape of each part. */
export interface HeatPumpLoad {
  spaceHeatKwh: Float64Array;
  spaceShape: Float64Array;
  hotWaterHeatKwh: Float64Array;
  hotWaterShape: Float64Array;
}

const cop = (k: number, shape: number, ceiling: number): number => Math.min(ceiling, k * shape);

export interface HeatPumpElectricity {
  spaceKwh: Float64Array;
  hotWaterKwh: Float64Array;
  /** The two parts added. */
  totalKwh: Float64Array;
}

/** Heating electricity in each hour, by part and in total: each part's heat ÷ its COP, min(k × shape, ceiling). */
export function heatPumpElectricityParts(load: HeatPumpLoad, scale: CopScale, curve: CopCurve): HeatPumpElectricity {
  const { spaceHeatKwh, spaceShape, hotWaterHeatKwh, hotWaterShape } = load;
  const spaceKwh = new Float64Array(spaceHeatKwh.length);
  const hotWaterKwh = new Float64Array(spaceHeatKwh.length);
  const totalKwh = new Float64Array(spaceHeatKwh.length);
  for (let hour = 0; hour < spaceKwh.length; hour += 1) {
    const space = spaceHeatKwh[hour]! / cop(scale.k, spaceShape[hour]!, curve.copCeiling);
    const hotWater = hotWaterHeatKwh[hour]! / cop(scale.k, hotWaterShape[hour]!, curve.copCeiling);
    spaceKwh[hour] = space;
    hotWaterKwh[hour] = hotWater;
    totalKwh[hour] = space + hotWater;
  }
  return { spaceKwh, hotWaterKwh, totalKwh };
}

/** Heating electricity in each hour: the space heating and hot water parts added. */
export function heatPumpElectricity(load: HeatPumpLoad, scale: CopScale, curve: CopCurve): Float64Array {
  return heatPumpElectricityParts(load, scale, curve).totalKwh;
}

/**
 * Solves k so that the run's total heat ÷ total electricity equals the SPF.
 * Without the ceiling, k = SPF × Σ(heat ÷ shape) ÷ Σheat. If that k puts any hour above the ceiling, those hours
 * run at the ceiling and k is re-solved on the rest; this repeats until no further hour reaches the ceiling.
 * Each step only raises k and caps at least one more hour, so the loop ends: once no further hour is capped, the
 * next k equals the current one exactly.
 */
export function solveCopScale(load: HeatPumpLoad, spf: number, curve: CopCurve): CopScale {
  if (!(spf > 0)) throw new Error(`The SPF must be positive, got ${spf}`);
  if (!(spf < curve.copCeiling)) throw new Error(`The SPF (${spf}) must be below the COP ceiling (${curve.copCeiling}) for k to reach it`);
  const parts: [Float64Array, Float64Array][] = [
    [load.spaceHeatKwh, load.spaceShape],
    [load.hotWaterHeatKwh, load.hotWaterShape],
  ];
  let totalHeat = 0;
  for (const [heat] of parts) for (const value of heat) totalHeat += value;
  if (!(totalHeat > 0)) throw new Error('The reference run delivers no heat, so k cannot be solved');
  const targetElectricity = totalHeat / spf;

  let k = 0;
  let ceilingBound = false;
  for (;;) {
    // Hours at or above the ceiling (at the current k) run at the ceiling; the rest scale with k.
    let uncappedHeatPerShape = 0;
    let cappedElectricity = 0;
    for (const [heat, shape] of parts) {
      for (let hour = 0; hour < heat.length; hour += 1) {
        const value = heat[hour]!;
        if (value === 0) continue;
        if (k * shape[hour]! >= curve.copCeiling) cappedElectricity += value / curve.copCeiling;
        else uncappedHeatPerShape += value / shape[hour]!;
      }
    }
    const next = uncappedHeatPerShape / (targetElectricity - cappedElectricity);
    if (cappedElectricity > 0) ceilingBound = true;
    if (next <= k) return { k, ceilingBound };
    k = next;
  }
}

/** The year's heat ÷ electricity for a load at a given scale: the seasonal performance factor it gives. */
export function seasonalPerformance(load: HeatPumpLoad, scale: CopScale, curve: CopCurve): number {
  const electricity = heatPumpElectricity(load, scale, curve);
  let heat = 0;
  let used = 0;
  for (let hour = 0; hour < electricity.length; hour += 1) {
    heat += load.spaceHeatKwh[hour]! + load.hotWaterHeatKwh[hour]!;
    used += electricity[hour]!;
  }
  return heat / used;
}
