// ABOUT: Roof solar PV: the roof's maximum system size, hourly generation, and how each hour's generation is used
// ABOUT: Generation meets base load, then heating, then the cylinder; the rest is exported

import { STC_CELL_TEMPERATURE_C, STC_IRRADIANCE_W_PER_M2 } from './constants.ts';

export interface PvSystem {
  peakPowerKw: number;
  /** Tilt from horizontal, radians: the roof pitch, since the panels lie on the roof. */
  tilt: number;
  /** Radians from south, west positive. */
  azimuth: number;
  /** Share lost between the modules' DC output and the house: inverter, cables, mismatch and soiling. */
  systemLoss: number;
  /** Change in module output per K of cell temperature above 25 °C, as a fraction (negative). */
  temperatureCoefficientPerK: number;
  /** Cell temperature above air temperature per W/m² on the panel, K. */
  cellTemperatureRiseKPerWm2: number;
}

/** The roof's room for panels, the facts it is computed from. */
export interface Roof {
  footprintM2: number;
  /** Radians. */
  pitch: number;
  /** Share of one roof slope that panels can cover, after edges, vents and roof windows. */
  usableFraction: number;
  kwpPerM2: number;
}

/** The largest system one roof slope takes: footprint ÷ cos(pitch) × ½ × usable fraction × kWp per m². */
export function roofMaximumKw(roof: Roof): number {
  if (!(roof.footprintM2 > 0)) throw new Error(`The roof footprint must be positive, got ${roof.footprintM2} m²`);
  if (!(roof.pitch >= 0 && roof.pitch < Math.PI / 2)) throw new Error(`The roof pitch must be from 0 to below 90°, got ${roof.pitch} radians`);
  if (!(roof.usableFraction > 0 && roof.usableFraction <= 1)) throw new Error(`The usable roof fraction must be above 0 and at most 1, got ${roof.usableFraction}`);
  if (!(roof.kwpPerM2 > 0)) throw new Error(`The kWp per m² must be positive, got ${roof.kwpPerM2}`);
  return ((roof.footprintM2 / Math.cos(roof.pitch)) * roof.usableFraction * roof.kwpPerM2) / 2;
}

export function checkPvSystem(system: PvSystem): void {
  if (!(system.peakPowerKw >= 0)) throw new Error(`The PV peak power must not be negative, got ${system.peakPowerKw} kW`);
  if (!(system.systemLoss >= 0 && system.systemLoss < 1)) throw new Error(`The PV system loss must be from 0 to below 1, got ${system.systemLoss}`);
  if (!(system.temperatureCoefficientPerK <= 0)) {
    throw new Error(`The PV temperature coefficient must not be positive, got ${system.temperatureCoefficientPerK} per K`);
  }
  if (!(system.cellTemperatureRiseKPerWm2 >= 0)) {
    throw new Error(`The cell temperature rise must not be negative, got ${system.cellTemperatureRiseKPerWm2} K per W/m²`);
  }
}

/**
 * AC generation in each hour, kWh:
 * P × G ÷ 1,000 × (1 + γ (T_cell − 25)) × (1 − system loss), with T_cell = T_air + rise × G.
 * Each hour lasts one hour, so the hour's mean power in kW is its energy in kWh. Never negative.
 */
export function pvGenerationKwh(planeIrradianceW: Float64Array, airTemperatureC: Float64Array, system: PvSystem): Float64Array {
  checkPvSystem(system);
  if (planeIrradianceW.length !== airTemperatureC.length) {
    throw new Error(`Irradiance and air temperature differ in length: ${planeIrradianceW.length} and ${airTemperatureC.length}`);
  }
  const result = new Float64Array(planeIrradianceW.length);
  const delivered = system.peakPowerKw * (1 - system.systemLoss);
  for (let hour = 0; hour < result.length; hour += 1) {
    const irradiance = planeIrradianceW[hour]!;
    if (irradiance <= 0) continue;
    const cellC = airTemperatureC[hour]! + system.cellTemperatureRiseKPerWm2 * irradiance;
    const temperatureFactor = 1 + system.temperatureCoefficientPerK * (cellC - STC_CELL_TEMPERATURE_C);
    result[hour] = Math.max(0, delivered * (irradiance / STC_IRRADIANCE_W_PER_M2) * temperatureFactor);
  }
  return result;
}

/** The house's electricity loads in the order solar meets them. */
export interface ElectricityLoads {
  baseKwh: Float64Array;
  /** The heat pump's space heating electricity, or the boiler's pump and fan. */
  heatingKwh: Float64Array;
  /** The heat pump's cylinder reheats. Zero for a combi boiler. */
  cylinderKwh: Float64Array;
}

export interface SolarUse {
  importKwh: Float64Array;
  exportKwh: Float64Array;
  /** Annual generation used by each load. */
  usedByBaseKwh: number;
  usedByHeatingKwh: number;
  usedByCylinderKwh: number;
}

/**
 * Each hour, generation meets base load first, then heating, then the cylinder; what is left is exported, and what
 * the loads still need is imported. With no control, the order only says which load solar met: import and export
 * are the same in any order. Pass a zero generation array for a house without solar.
 */
export function useSolar(generationKwh: Float64Array, loads: ElectricityLoads): SolarUse {
  const hours = generationKwh.length;
  for (const [name, load] of [['base', loads.baseKwh], ['heating', loads.heatingKwh], ['cylinder', loads.cylinderKwh]] as const) {
    if (load.length !== hours) throw new Error(`The ${name} load has ${load.length} hours; generation has ${hours}`);
  }
  const importKwh = new Float64Array(hours);
  const exportKwh = new Float64Array(hours);
  let usedByBaseKwh = 0;
  let usedByHeatingKwh = 0;
  let usedByCylinderKwh = 0;
  for (let hour = 0; hour < hours; hour += 1) {
    let left = generationKwh[hour]!;
    const base = Math.min(left, loads.baseKwh[hour]!);
    left -= base;
    const heating = Math.min(left, loads.heatingKwh[hour]!);
    left -= heating;
    const cylinder = Math.min(left, loads.cylinderKwh[hour]!);
    left -= cylinder;
    usedByBaseKwh += base;
    usedByHeatingKwh += heating;
    usedByCylinderKwh += cylinder;
    exportKwh[hour] = left;
    importKwh[hour] = loads.baseKwh[hour]! - base + loads.heatingKwh[hour]! - heating + loads.cylinderKwh[hour]! - cylinder;
  }
  return { importKwh, exportKwh, usedByBaseKwh, usedByHeatingKwh, usedByCylinderKwh };
}
