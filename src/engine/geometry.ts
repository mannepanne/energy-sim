// ABOUT: The heat loss coefficient H of the house, in W/K
// ABOUT: H = f_fabric × (Σ U·A + 0.33 · n · V); the party wall loses no heat, so it has no term

import { AIR_HEAT_CAPACITY_WH_PER_M3K } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

export interface HeatLoss {
  /** Σ U·A over walls, windows, door, roof and ground floor, before the fabric quality factor. */
  fabricWPerK: number;
  /** 0.33 · n · V, before the fabric quality factor. */
  ventilationWPerK: number;
  /** (fabric + ventilation) × fabric quality factor. */
  totalWPerK: number;
}

export function heatLoss(inputs: EngineInputs): HeatLoss {
  const elements: [string, number, number][] = [
    ['external walls', inputs.externalWallAreaM2, inputs.wallUValue],
    ['windows', inputs.windowAreaM2, inputs.windowUValue],
    ['door', inputs.doorAreaM2, inputs.doorUValue],
    ['roof', inputs.roofAreaM2, inputs.roofUValue],
    ['ground floor', inputs.groundFloorAreaM2, inputs.groundFloorUValue],
  ];
  let fabricWPerK = 0;
  for (const [name, area, uValue] of elements) {
    if (area < 0 || uValue < 0) throw new Error(`Element "${name}" has a negative area or U-value`);
    fabricWPerK += area * uValue;
  }
  if (inputs.airChangesPerHour < 0 || inputs.heatedVolumeM3 < 0) {
    throw new Error('The air change rate and heated volume must not be negative');
  }
  if (inputs.fabricQualityFactor <= 0) throw new Error('The fabric quality factor must be positive');
  const ventilationWPerK = AIR_HEAT_CAPACITY_WH_PER_M3K * inputs.airChangesPerHour * inputs.heatedVolumeM3;
  return { fabricWPerK, ventilationWPerK, totalWPerK: inputs.fabricQualityFactor * (fabricWPerK + ventilationWPerK) };
}
