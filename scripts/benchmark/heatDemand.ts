// ABOUT: Rough annual heat-demand calculation for benchmark step 1 (no hourly engine)
// ABOUT: Heat loss coefficient H, monthly degree days (Hitchin formula) and annual space heat

/**
 * Heat capacity of air, in Wh per m³ per K. A physical constant.
 * Defined here on purpose rather than imported from the engine: the benchmark is an independent
 * cross-check of the engine, so it shares no code with it.
 */
export const AIR_HEAT_CAPACITY_WH_PER_M3K = 0.33;

const HOURS_PER_DAY = 24;
const WH_PER_KWH = 1000;

export interface FabricElement {
  name: string;
  areaM2: number;
  uValueWPerM2K: number;
}

export interface HeatLossInput {
  elements: FabricElement[];
  airChangesPerHour: number;
  heatedVolumeM3: number;
}

export interface HeatLossResult {
  fabricWPerK: number;
  ventilationWPerK: number;
  totalWPerK: number;
}

export interface MonthlyClimate {
  meanTemperatureC: number;
  days: number;
}

/** H = Σ U·A + 0.33·n·V, in W/K. */
export function heatLossCoefficient(input: HeatLossInput): HeatLossResult {
  let fabricWPerK = 0;
  for (const element of input.elements) {
    if (element.areaM2 < 0 || element.uValueWPerM2K < 0) {
      throw new Error(`Element "${element.name}" has a negative area or U-value`);
    }
    fabricWPerK += element.areaM2 * element.uValueWPerM2K;
  }
  if (input.airChangesPerHour < 0) throw new Error('The air change rate must not be negative');
  if (input.heatedVolumeM3 < 0) throw new Error('The heated volume must not be negative');

  const ventilationWPerK = AIR_HEAT_CAPACITY_WH_PER_M3K * input.airChangesPerHour * input.heatedVolumeM3;
  return { fabricWPerK, ventilationWPerK, totalWPerK: fabricWPerK + ventilationWPerK };
}

/**
 * Heating degree days for one month from its mean temperature, using Hitchin's formula
 * (CIBSE TM41): DD = N·(Tb − Tm) / (1 − e^(−k·(Tb − Tm))).
 * It allows for days warmer than the base within a month, so it works at any base temperature.
 * At Tb = Tm the formula's limit is N / k.
 */
export function monthlyDegreeDays(month: MonthlyClimate, baseTemperatureC: number, k: number): number {
  if (k <= 0) throw new Error('The spread constant k must be positive');
  const difference = baseTemperatureC - month.meanTemperatureC;
  const kd = k * difference;
  if (Math.abs(kd) < 1e-9) return month.days / k;
  return (month.days * difference) / -Math.expm1(-kd);
}

export function annualDegreeDays(months: MonthlyClimate[], baseTemperatureC: number, k: number): number {
  if (months.length !== 12) throw new Error(`Expected 12 months of climate data, got ${months.length}`);
  return months.reduce((sum, month) => sum + monthlyDegreeDays(month, baseTemperatureC, k), 0);
}

/** The outdoor temperature at which gains alone hold the house at its mean internal temperature. */
export function balancePointTemperature(input: {
  meanInternalTemperatureC: number;
  gainsW: number;
  heatLossCoefficientWPerK: number;
}): number {
  if (input.heatLossCoefficientWPerK <= 0) throw new Error('H must be positive');
  return input.meanInternalTemperatureC - input.gainsW / input.heatLossCoefficientWPerK;
}

/** Annual space heat in kWh: H (W/K) × degree days (K·day) × 24 h ÷ 1000. */
export function annualSpaceHeatKwh(heatLossCoefficientWPerK: number, degreeDays: number): number {
  return (heatLossCoefficientWPerK * degreeDays * HOURS_PER_DAY) / WH_PER_KWH;
}
