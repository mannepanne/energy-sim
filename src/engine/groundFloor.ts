// ABOUT: The ground floor U-value by BS EN ISO 13370, as RdSAP 10 section 5.12 applies it
// ABOUT: Solid and suspended floors, from floor area, exposed perimeter, wall thickness and insulation

import type { RegisterAccessor } from '../register/access.ts';
import type { GroundFloorConstruction } from './archetypes.ts';

const MM_PER_M = 1000;
/** ISO 13370's coefficient for the ventilation of the underfloor space, in its suspended floor formula. */
const UNDERFLOOR_VENTILATION_COEFFICIENT = 1450;
/** ISO 13370's switch to its formula for a well-insulated floor. */
const WELL_INSULATED_FACTOR = 0.457;

export interface GroundFloorParameters {
  soilConductivity: number;
  internalSurfaceResistance: number;
  externalSurfaceResistance: number;
  insulationConductivity: number;
  deckResistance: number;
  heightAboveGround: number;
  windSpeed: number;
  windShielding: number;
  ventilationOpeningsPerMetre: number;
  underfloorWallUValue: number;
}

export function groundFloorParameters(access: RegisterAccessor): GroundFloorParameters {
  const value = (key: keyof GroundFloorParameters): number => access.cellNumber('fabric.groundFloor', key);
  return {
    soilConductivity: value('soilConductivity'),
    internalSurfaceResistance: value('internalSurfaceResistance'),
    externalSurfaceResistance: value('externalSurfaceResistance'),
    insulationConductivity: value('insulationConductivity'),
    deckResistance: value('deckResistance'),
    heightAboveGround: value('heightAboveGround'),
    windSpeed: value('windSpeed'),
    windShielding: value('windShielding'),
    ventilationOpeningsPerMetre: value('ventilationOpeningsPerMetre'),
    underfloorWallUValue: value('underfloorWallUValue'),
  };
}

export interface GroundFloor {
  construction: GroundFloorConstruction;
  areaM2: number;
  exposedPerimeterM: number;
  wallThicknessMm: number;
  insulationMm: number;
}

/** The unrounded ISO 13370 U-value, W/m²K. A floor with no exposed perimeter loses heat only through its depth. */
export function groundFloorUValueExact(floor: GroundFloor, p: GroundFloorParameters): number {
  if (!(floor.areaM2 > 0) || floor.exposedPerimeterM < 0 || floor.wallThicknessMm < 0 || floor.insulationMm < 0) {
    throw new Error('A ground floor needs a positive area and non-negative perimeter, wall thickness and insulation');
  }
  if (floor.exposedPerimeterM === 0) return 0;
  const lambda = p.soilConductivity;
  const wallM = floor.wallThicknessMm / MM_PER_M;
  const insulationResistance = floor.insulationMm / MM_PER_M / p.insulationConductivity;
  // B is the characteristic dimension of the floor.
  const b = (2 * floor.areaM2) / floor.exposedPerimeterM;

  if (floor.construction === 'solid') {
    const dt = wallM + lambda * (p.internalSurfaceResistance + insulationResistance + p.externalSurfaceResistance);
    return dt < b ? ((2 * lambda) / (Math.PI * b + dt)) * Math.log((Math.PI * b) / dt + 1) : lambda / (WELL_INSULATED_FACTOR * b + dt);
  }

  const dg = wallM + lambda * (p.internalSurfaceResistance + p.externalSurfaceResistance);
  const ug = ((2 * lambda) / (Math.PI * b + dg)) * Math.log((Math.PI * b) / dg + 1);
  const ux =
    (2 * p.heightAboveGround * p.underfloorWallUValue) / b +
    (UNDERFLOOR_VENTILATION_COEFFICIENT * p.ventilationOpeningsPerMetre * p.windSpeed * p.windShielding) / b;
  const deckResistance = p.deckResistance + insulationResistance;
  return 1 / (2 * p.internalSurfaceResistance + deckResistance + 1 / (ug + ux));
}

/** The ground floor U-value rounded to two decimal places, as RdSAP 10 section 5.12 specifies. */
export function groundFloorUValue(floor: GroundFloor, p: GroundFloorParameters): number {
  return Math.round(groundFloorUValueExact(floor, p) * 100) / 100;
}
