// ABOUT: Derived geometry (element areas and heated volume from floor area, storeys and footprint shape),
// ABOUT: and the heat loss coefficient H = f_fabric × (Σ U·A + y × exposed area + 0.33 · n · V), in W/K

import { AIR_HEAT_CAPACITY_WH_PER_M3K } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

/** The few facts geometry is derived from. */
export interface GeometryFacts {
  floorAreaM2: number;
  storeys: number;
  /** Footprint depth ÷ width. */
  aspectRatio: number;
  /** Each party wall runs the depth of the house. */
  partyWalls: number;
  roomHeightM: number;
  /** Added to the room height of every storey above the lowest (RdSAP's floor void). */
  upperStoreyAllowanceM: number;
  /** Window area = slope × floor area + intercept. */
  windowAreaSlope: number;
  windowAreaInterceptM2: number;
  doorAreaM2: number;
}

export interface Geometry {
  footprintM2: number;
  widthM: number;
  depthM: number;
  exposedPerimeterM: number;
  /** The sum of the storey heights. */
  wallHeightM: number;
  grossWallAreaM2: number;
  windowAreaM2: number;
  doorAreaM2: number;
  /** Gross wall area less windows and door. */
  externalWallAreaM2: number;
  partyWallAreaM2: number;
  roofAreaM2: number;
  groundFloorAreaM2: number;
  heatedVolumeM3: number;
}

/**
 * Footprint = floor area ÷ storeys, with width and depth from the aspect ratio. The exposed perimeter is the
 * footprint perimeter less the party walls. Walls are perimeter × the sum of the storey heights, less windows and
 * door; roof and ground floor equal the footprint; volume is footprint × the sum of the storey heights.
 */
export function deriveGeometry(facts: GeometryFacts): Geometry {
  const { floorAreaM2, storeys, aspectRatio, partyWalls } = facts;
  if (!(floorAreaM2 > 0) || !Number.isInteger(storeys) || storeys < 1 || !(aspectRatio > 0)) {
    throw new Error('Geometry needs a positive floor area and aspect ratio, and a whole number of storeys');
  }
  if (!Number.isInteger(partyWalls) || partyWalls < 0 || partyWalls > 2) throw new Error(`A house has 0, 1 or 2 party walls, got ${partyWalls}`);
  const footprintM2 = floorAreaM2 / storeys;
  const widthM = Math.sqrt(footprintM2 / aspectRatio);
  const depthM = aspectRatio * widthM;
  const exposedPerimeterM = 2 * (widthM + depthM) - partyWalls * depthM;
  const wallHeightM = storeys * facts.roomHeightM + (storeys - 1) * facts.upperStoreyAllowanceM;
  const grossWallAreaM2 = exposedPerimeterM * wallHeightM;
  const windowAreaM2 = facts.windowAreaSlope * floorAreaM2 + facts.windowAreaInterceptM2;
  const externalWallAreaM2 = grossWallAreaM2 - windowAreaM2 - facts.doorAreaM2;
  if (windowAreaM2 < 0 || externalWallAreaM2 < 0) {
    throw new Error(`Windows (${windowAreaM2.toFixed(2)} m²) and door do not fit in ${grossWallAreaM2.toFixed(2)} m² of wall`);
  }
  return {
    footprintM2,
    widthM,
    depthM,
    exposedPerimeterM,
    wallHeightM,
    grossWallAreaM2,
    windowAreaM2,
    doorAreaM2: facts.doorAreaM2,
    externalWallAreaM2,
    partyWallAreaM2: partyWalls * depthM * wallHeightM,
    roofAreaM2: footprintM2,
    groundFloorAreaM2: footprintM2,
    heatedVolumeM3: footprintM2 * wallHeightM,
  };
}

export interface HeatLoss {
  /** Σ U·A over walls, party walls, windows, door, roof and ground floor, before the fabric quality factor. */
  fabricWPerK: number;
  /** y × the exposed area of walls, windows, door, roof and ground floor, before the fabric quality factor. */
  thermalBridgingWPerK: number;
  /** 0.33 · n · V, before the fabric quality factor. */
  ventilationWPerK: number;
  /** (fabric + thermal bridging + ventilation) × fabric quality factor. */
  totalWPerK: number;
}

export function heatLoss(inputs: EngineInputs): HeatLoss {
  const elements: [string, number, number][] = [
    ['external walls', inputs.externalWallAreaM2, inputs.wallUValue],
    ['party walls', inputs.partyWallAreaM2, inputs.partyWallUValue],
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
  if (inputs.thermalBridgingWPerM2K < 0) throw new Error('The thermal bridging factor must not be negative');
  if (inputs.fabricQualityFactor <= 0) throw new Error('The fabric quality factor must be positive');
  const exposedAreaM2 = inputs.externalWallAreaM2 + inputs.windowAreaM2 + inputs.doorAreaM2 + inputs.roofAreaM2 + inputs.groundFloorAreaM2;
  const thermalBridgingWPerK = inputs.thermalBridgingWPerM2K * exposedAreaM2;
  const ventilationWPerK = AIR_HEAT_CAPACITY_WH_PER_M3K * inputs.airChangesPerHour * inputs.heatedVolumeM3;
  return {
    fabricWPerK,
    thermalBridgingWPerK,
    ventilationWPerK,
    totalWPerK: inputs.fabricQualityFactor * (fabricWPerK + thermalBridgingWPerK + ventilationWPerK),
  };
}
