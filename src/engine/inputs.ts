// ABOUT: Reads every number the engine uses for one house from the register, through the typed accessor
// ABOUT: Derives geometry and the ground floor U-value; uncertain rows and cells give their default unless overridden

import type { RegisterAccessor } from '../register/access.ts';
import type { RowId } from '../register/ids.ts';
import {
  archetypeFacts,
  checkHouse,
  defaultHouse,
  GROUND_FLOOR_CONSTRUCTIONS,
  oneOf,
  REFERENCE_ARCHETYPE,
  wallKey,
  type House,
} from './archetypes.ts';
import { deriveGeometry } from './geometry.ts';
import { groundFloorParameters, groundFloorUValue } from './groundFloor.ts';
import type { UncertainSpec } from './sampling.ts';

/** The uncertain rows the engine reads. Sampling draws them, and any uncertain table cell a house reads. */
export const UNCERTAIN_ROW_IDS = [
  'fabric.qualityFactor',
  'gains.perOccupant',
  'heating.meanInternalTemperature',
  'heating.boilerSeasonalEfficiency',
  'heating.heatPumpSpf',
  'hotWater.litresPerOccupant',
  'electricity.baseUse',
] as const satisfies readonly RowId[];

export type UncertainRowId = (typeof UNCERTAIN_ROW_IDS)[number];

/** An uncertain table cell is drawn under its row id and key, joined by "|". */
export type CellDrawKey = `${RowId}|${string}`;
export type DrawKey = UncertainRowId | CellDrawKey;

export const cellDrawKey = (id: RowId, key: string): CellDrawKey => `${id}|${key}`;

/**
 * Values for uncertain rows and cells, by draw key, that replace their defaults. This is the hook for sampling.
 * It is not the user-override path: the register's `overridable` flag is for phase 3 to wire up.
 */
export type UncertainOverrides = Partial<Record<DrawKey, number>>;

/** One uncertain value a house reads, with what sampling and the sensitivity table need. */
export interface UncertainDraw extends UncertainSpec {
  id: DrawKey;
  label: string;
  unit: string;
}

export interface EngineInputs {
  house: House;

  outdoorTemperatureOffsetK: number;
  irradianceSampleMinute: number;

  heatedVolumeM3: number;
  exposedPerimeterM: number;
  externalWallAreaM2: number;
  partyWallAreaM2: number;
  windowAreaM2: number;
  doorAreaM2: number;
  roofAreaM2: number;
  groundFloorAreaM2: number;

  wallUValue: number;
  partyWallUValue: number;
  /** The effective window U-value, with the curtain resistance added. */
  windowUValue: number;
  doorUValue: number;
  roofUValue: number;
  /** Computed by BS EN ISO 13370 from the floor area, exposed perimeter and wall thickness. */
  groundFloorUValue: number;
  thermalBridgingWPerM2K: number;
  airChangesPerHour: number;
  fabricQualityFactor: number;

  /** Floor-area term plus occupants × the per-occupant term. */
  internalGainsW: number;
  /** g at normal incidence. */
  windowGValue: number;
  nonNormalIncidenceFactor: number;
  windowFrameFactor: number;
  solarAccessFactor: number;
  groundReflectance: number;

  meanInternalTemperatureC: number;
  boilerSeasonalEfficiency: number;
  heatPumpSpf: number;

  /** Fixed part plus occupants × the per-occupant term. */
  hotWaterLitresPerDay: number;
  hotWaterDeliveryTemperatureC: number;
  coldFeedTemperatureC: number;
  cylinderStandingLossKwhPerDay: number;

  electricityUnitRatePence: number;
  electricityStandingChargePencePerDay: number;
  gasUnitRatePence: number;
  gasStandingChargePencePerDay: number;

  gasCarbonKgPerKwh: number;
  gridCarbonKgPerKwh: number;

  baseElectricityKwhPerYear: number;
}

export interface ReadInputsOptions {
  /** The house to read. Defaults to the reference archetype (the 1930s semi) with its default answers. */
  house?: House;
  overrides?: UncertainOverrides;
}

/** Reads values, applying overrides, and records each uncertain value it reads. */
class Reader {
  readonly draws = new Map<DrawKey, UncertainDraw>();
  private readonly access: RegisterAccessor;
  private readonly overrides: UncertainOverrides;

  constructor(access: RegisterAccessor, overrides: UncertainOverrides) {
    this.access = access;
    this.overrides = overrides;
  }

  fixed(id: RowId): number {
    return this.access.fixed(id).value;
  }

  uncertain(id: UncertainRowId): number {
    const row = this.access.uncertain(id);
    this.draws.set(id, { ...row, id });
    return this.overrides[id] ?? row.default;
  }

  /** A number cell: a fixed value, or an uncertain cell's default unless overridden. */
  cell(id: RowId, key: string): number {
    const cell = this.access.cell(id, key);
    if (!('distribution' in cell)) return this.access.cellNumber(id, key);
    const drawKey = cellDrawKey(id, key);
    const row = this.access.table(id);
    this.draws.set(drawKey, { ...cell, id: drawKey, label: `${row.label} (${key})`, unit: row.unit });
    return this.overrides[drawKey] ?? cell.default;
  }

  text(id: RowId, key: string): string {
    return this.access.cellString(id, key);
  }
}

function read(access: RegisterAccessor, house: House, reader: Reader): EngineInputs {
  checkHouse(access, house);
  const facts = archetypeFacts(access, house.archetype);
  const band = facts.ageBand;
  const geometry = deriveGeometry({
    floorAreaM2: house.floorAreaM2,
    storeys: facts.storeys,
    aspectRatio: facts.aspectRatio,
    partyWalls: facts.partyWalls,
    roomHeightM: reader.cell('archetypes.roomHeight', band),
    upperStoreyAllowanceM: reader.fixed('archetypes.upperStoreyAllowance'),
    windowAreaSlope: reader.cell('archetypes.windowAreaSlope', band),
    windowAreaInterceptM2: reader.cell('archetypes.windowAreaIntercept', band),
    doorAreaM2: reader.fixed('geometry.doorArea'),
  });
  const wallThicknessMm = reader.cell('archetypes.wallThickness', `${facts.wallConstruction}/${band}`);
  const groundFloor = groundFloorUValue(
    {
      construction: oneOf(GROUND_FLOOR_CONSTRUCTIONS, reader.text('archetypes.groundFloorConstruction', band), 'ground floor construction'),
      areaM2: geometry.groundFloorAreaM2,
      exposedPerimeterM: geometry.exposedPerimeterM,
      wallThicknessMm,
      insulationMm: reader.cell('archetypes.groundFloorInsulation', band),
    },
    groundFloorParameters(access),
  );
  const windowUValueBare = reader.cell('fabric.windowUValue', house.glazing);
  const curtainResistance = reader.fixed('fabric.windowCurtainResistance');

  return {
    house,

    outdoorTemperatureOffsetK: reader.fixed('weather.outdoorTemperatureOffset'),
    irradianceSampleMinute: reader.fixed('weather.irradianceSampleMinute'),

    heatedVolumeM3: geometry.heatedVolumeM3,
    exposedPerimeterM: geometry.exposedPerimeterM,
    externalWallAreaM2: geometry.externalWallAreaM2,
    partyWallAreaM2: geometry.partyWallAreaM2,
    windowAreaM2: geometry.windowAreaM2,
    doorAreaM2: geometry.doorAreaM2,
    roofAreaM2: geometry.roofAreaM2,
    groundFloorAreaM2: geometry.groundFloorAreaM2,

    wallUValue: reader.cell('fabric.wallUValue', wallKey(facts, house.walls)),
    partyWallUValue: reader.cell('fabric.partyWallUValue', facts.wallConstruction),
    windowUValue: 1 / (1 / windowUValueBare + curtainResistance),
    doorUValue: reader.cell('fabric.doorUValue', band),
    roofUValue: reader.cell('fabric.roofUValue', house.loft),
    groundFloorUValue: groundFloor,
    thermalBridgingWPerM2K: reader.cell('fabric.thermalBridging', band),
    airChangesPerHour: reader.cell('fabric.airChangeRate', band),
    fabricQualityFactor: reader.uncertain('fabric.qualityFactor'),

    internalGainsW: reader.fixed('gains.perFloorArea') * house.floorAreaM2 + reader.uncertain('gains.perOccupant') * house.occupants,
    windowGValue: reader.cell('gains.windowGValue', house.glazing),
    nonNormalIncidenceFactor: reader.fixed('gains.nonNormalIncidenceFactor'),
    windowFrameFactor: reader.fixed('gains.windowFrameFactor'),
    solarAccessFactor: reader.fixed('gains.solarAccessFactor'),
    groundReflectance: reader.fixed('gains.groundReflectance'),

    meanInternalTemperatureC: reader.uncertain('heating.meanInternalTemperature'),
    boilerSeasonalEfficiency: reader.uncertain('heating.boilerSeasonalEfficiency'),
    heatPumpSpf: reader.uncertain('heating.heatPumpSpf'),

    hotWaterLitresPerDay: reader.fixed('hotWater.litresBase') + reader.uncertain('hotWater.litresPerOccupant') * house.occupants,
    hotWaterDeliveryTemperatureC: reader.fixed('hotWater.deliveryTemperature'),
    coldFeedTemperatureC: reader.fixed('hotWater.coldFeedTemperature'),
    cylinderStandingLossKwhPerDay: reader.fixed('hotWater.cylinderStandingLoss'),

    electricityUnitRatePence: reader.fixed('prices.electricityUnitRate'),
    electricityStandingChargePencePerDay: reader.fixed('prices.electricityStandingCharge'),
    gasUnitRatePence: reader.fixed('prices.gasUnitRate'),
    gasStandingChargePencePerDay: reader.fixed('prices.gasStandingCharge'),

    gasCarbonKgPerKwh: reader.fixed('carbon.gasFactor'),
    gridCarbonKgPerKwh: reader.fixed('carbon.gridElectricityFactor'),

    baseElectricityKwhPerYear: reader.uncertain('electricity.baseUse'),
  };
}

/**
 * Reads the engine's inputs for one house. Throws, naming the id or key, if a row or cell is missing or of the
 * wrong kind, if the house is invalid, or if an override names a value the house does not read.
 */
export function readInputs(access: RegisterAccessor, options: ReadInputsOptions = {}): EngineInputs {
  const { overrides = {} } = options;
  const house = options.house ?? defaultHouse(access, REFERENCE_ARCHETYPE);
  for (const [key, value] of Object.entries(overrides)) {
    if (!Number.isFinite(value)) throw new Error(`Override for "${key}" must be a finite number, got ${value}`);
  }
  const reader = new Reader(access, overrides);
  const inputs = read(access, house, reader);
  const drawn = new Set<string>(reader.draws.keys());
  for (const key of Object.keys(overrides)) {
    if (!drawn.has(key)) throw new Error(`Override for "${key}" names no uncertain value this house reads`);
  }
  return inputs;
}

/** Every uncertain row and cell a house reads, in the order the engine reads them. */
export function uncertainDraws(access: RegisterAccessor, house: House = defaultHouse(access, REFERENCE_ARCHETYPE)): UncertainDraw[] {
  const reader = new Reader(access, {});
  read(access, house, reader);
  return [...reader.draws.values()];
}
