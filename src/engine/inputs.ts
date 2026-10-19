// ABOUT: Reads every number the engine uses for one house from the register, through the typed accessor
// ABOUT: Derives geometry, the ground floor U-value and the roof's PV maximum; uncertain values give their default unless overridden

import type { RegisterAccessor } from '../register/access.ts';
import type { RowId } from '../register/ids.ts';
import {
  archetypeFacts,
  bandConstructionKey,
  checkHouse,
  defaultHouse,
  GROUND_FLOOR_CONSTRUCTIONS,
  oneOf,
  REFERENCE_ARCHETYPE,
  wallKey,
  type ArchetypeFacts,
  type House,
} from './archetypes.ts';
import { deriveGeometry } from './geometry.ts';
import { groundFloorParameters, groundFloorUValue } from './groundFloor.ts';
import { RADIANS_PER_DEGREE } from './constants.ts';
import { checkCompensation, checkCurve, type CompensationLine, type CopCurve } from './heatPump.ts';
import { checkPvSystem, roofMaximumKw, type PvSystem } from './pv.ts';
import type { UncertainSpec } from './sampling.ts';

/** The uncertain rows the engine reads. Sampling draws them, and any uncertain table cell a house reads. */
export const UNCERTAIN_ROW_IDS = [
  'fabric.qualityFactor',
  'gains.perOccupant',
  'heating.meanInternalTemperature',
  'heating.boilerSeasonalEfficiency',
  'heating.heatPumpSpf',
  'heating.heatPumpSpfWellInstalled',
  'heating.heatPumpStandbyShare',
  'heating.heatPumpStandbyShareWellInstalled',
  'heating.flowTemperatureAtDesign',
  'heating.flowTemperatureAtMild',
  'hotWater.litresPerOccupant',
  'electricity.baseUse',
  'solar.systemSize',
  'solar.azimuth',
  'solar.usableRoofFraction',
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
  /** Floor area ÷ storeys: the roof's plan area for PV, and the roof and ground floor areas. */
  footprintM2: number;
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
  boilerAuxiliaryElectricityKwhPerYear: number;
  /** The sampled SPF of the chosen scenario: field trial or well-installed. */
  heatPumpSpf: number;
  /** Controls, pumps and standby as a share of the year's heat pump electricity; inside the SPF's boundary. */
  heatPumpStandbyShare: number;
  copCurve: CopCurve;
  compensation: CompensationLine;

  /** Fixed part plus occupants × the per-occupant term. */
  hotWaterLitresPerDay: number;
  hotWaterDeliveryTemperatureC: number;
  coldFeedTemperatureC: number;
  cylinderStandingLossKwhPerDay: number;
  hotWaterFlowTemperatureC: number;
  cylinderVolumeLitres: number;
  cylinderSetpointC: number;
  cylinderMinimumC: number;
  /** The share of each day's hot water drawn in each local hour, 0–23. Sums to 1. */
  hotWaterDrawProfile: readonly number[];

  electricityUnitRatePence: number;
  electricityStandingChargePencePerDay: number;
  gasUnitRatePence: number;
  gasStandingChargePencePerDay: number;

  gasCarbonKgPerKwh: number;
  gridCarbonKgPerKwh: number;

  baseElectricityKwhPerYear: number;
  /** Hour-of-week shape (168 values, Monday 00:00 local first) of base use. */
  baseElectricityWeeklyProfile: readonly number[];
  /** Month level (12 values, January first) of base use. */
  baseElectricityMonthlyProfile: readonly number[];

  /** The roof PV system the solar setups have, its size already clipped to the roof maximum. */
  pv: PvSystem;
  /** The sampled size before the roof limit. */
  pvRequestedPeakPowerKw: number;
  pvRoofMaximumKw: number;
}

/**
 * Which SPF distribution the heat pump uses. `fieldTrial` is the Electrification of Heat field data;
 * `wellInstalled` is anchored on HeatpumpMonitor.org, a self-selected sample.
 */
export const SPF_SCENARIOS = ['fieldTrial', 'wellInstalled'] as const;
export type SpfScenario = (typeof SPF_SCENARIOS)[number];

/** The rows each SPF scenario reads: its SPF and its standby share, both from the same sample. */
export const SCENARIO_ROWS = {
  fieldTrial: { spf: 'heating.heatPumpSpf', standbyShare: 'heating.heatPumpStandbyShare' },
  wellInstalled: { spf: 'heating.heatPumpSpfWellInstalled', standbyShare: 'heating.heatPumpStandbyShareWellInstalled' },
} as const satisfies Record<SpfScenario, { spf: UncertainRowId; standbyShare: UncertainRowId }>;

/** The uncertain rows a scenario never reads: the other scenario's SPF and standby share. Tests use it to list a scenario's draws. */
export function rowsOutsideScenario(spfScenario: SpfScenario): UncertainRowId[] {
  return SPF_SCENARIOS.filter((other) => other !== spfScenario).flatMap((other) => Object.values(SCENARIO_ROWS[other]));
}

export interface ReadInputsOptions {
  /** The house to read. Defaults to the reference archetype (the 1930s semi) with its default answers. */
  house?: House;
  overrides?: UncertainOverrides;
  /** Defaults to `fieldTrial`. */
  spfScenario?: SpfScenario;
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

  profile(id: RowId): readonly number[] {
    return this.access.profile(id).values;
  }
}

type GeometryInputs = Pick<
  EngineInputs,
  | 'heatedVolumeM3'
  | 'footprintM2'
  | 'exposedPerimeterM'
  | 'externalWallAreaM2'
  | 'partyWallAreaM2'
  | 'windowAreaM2'
  | 'doorAreaM2'
  | 'roofAreaM2'
  | 'groundFloorAreaM2'
  | 'groundFloorUValue'
>;

/** Derived geometry, and the ground floor U-value, which depends on it. */
function readGeometry(access: RegisterAccessor, reader: Reader, house: House, facts: ArchetypeFacts): GeometryInputs {
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
  const wallThicknessMm = reader.cell('archetypes.wallThickness', bandConstructionKey(facts));
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
  return {
    heatedVolumeM3: geometry.heatedVolumeM3,
    footprintM2: geometry.footprintM2,
    exposedPerimeterM: geometry.exposedPerimeterM,
    externalWallAreaM2: geometry.externalWallAreaM2,
    partyWallAreaM2: geometry.partyWallAreaM2,
    windowAreaM2: geometry.windowAreaM2,
    doorAreaM2: geometry.doorAreaM2,
    roofAreaM2: geometry.roofAreaM2,
    groundFloorAreaM2: geometry.groundFloorAreaM2,
    groundFloorUValue: groundFloor,
  };
}

type FabricInputs = Pick<
  EngineInputs,
  | 'wallUValue'
  | 'partyWallUValue'
  | 'windowUValue'
  | 'doorUValue'
  | 'roofUValue'
  | 'thermalBridgingWPerM2K'
  | 'airChangesPerHour'
  | 'fabricQualityFactor'
>;

function readFabric(reader: Reader, house: House, facts: ArchetypeFacts): FabricInputs {
  const band = facts.ageBand;
  const windowUValueBare = reader.cell('fabric.windowUValue', house.glazing);
  const curtainResistance = reader.fixed('fabric.windowCurtainResistance');
  return {
    wallUValue: reader.cell('fabric.wallUValue', wallKey(facts, house.walls)),
    partyWallUValue: reader.cell('fabric.partyWallUValue', facts.wallConstruction),
    windowUValue: 1 / (1 / windowUValueBare + curtainResistance),
    doorUValue: reader.cell('fabric.doorUValue', band),
    roofUValue: reader.cell('fabric.roofUValue', house.loft),
    thermalBridgingWPerM2K: reader.cell('fabric.thermalBridging', band),
    airChangesPerHour: reader.cell('fabric.airChangeRate', band),
    fabricQualityFactor: reader.uncertain('fabric.qualityFactor'),
  };
}

type GainsInputs = Pick<
  EngineInputs,
  'internalGainsW' | 'windowGValue' | 'nonNormalIncidenceFactor' | 'windowFrameFactor' | 'solarAccessFactor' | 'groundReflectance'
>;

function readGains(reader: Reader, house: House): GainsInputs {
  return {
    internalGainsW: reader.fixed('gains.perFloorArea') * house.floorAreaM2 + reader.uncertain('gains.perOccupant') * house.occupants,
    windowGValue: reader.cell('gains.windowGValue', house.glazing),
    nonNormalIncidenceFactor: reader.fixed('gains.nonNormalIncidenceFactor'),
    windowFrameFactor: reader.fixed('gains.windowFrameFactor'),
    solarAccessFactor: reader.fixed('gains.solarAccessFactor'),
    groundReflectance: reader.fixed('gains.groundReflectance'),
  };
}

type HeatingInputs = Pick<
  EngineInputs,
  | 'meanInternalTemperatureC'
  | 'boilerSeasonalEfficiency'
  | 'boilerAuxiliaryElectricityKwhPerYear'
  | 'heatPumpSpf'
  | 'heatPumpStandbyShare'
  | 'copCurve'
  | 'compensation'
>;

function readHeating(reader: Reader, spfScenario: SpfScenario): HeatingInputs {
  const copCurve: CopCurve = {
    liftAllowanceK: reader.fixed('heating.copLiftAllowance'),
    shapeFloor: reader.fixed('heating.copShapeFloor'),
    shapeCeiling: reader.fixed('heating.copShapeCeiling'),
    copCeiling: reader.fixed('heating.copCeiling'),
  };
  const compensation: CompensationLine = {
    designOutdoorC: reader.fixed('heating.compensationDesignOutdoorTemperature'),
    designFlowC: reader.uncertain('heating.flowTemperatureAtDesign'),
    mildOutdoorC: reader.fixed('heating.compensationMildOutdoorTemperature'),
    mildFlowC: reader.uncertain('heating.flowTemperatureAtMild'),
  };
  checkCurve(copCurve);
  checkCompensation(compensation);
  return {
    meanInternalTemperatureC: reader.uncertain('heating.meanInternalTemperature'),
    boilerSeasonalEfficiency: reader.uncertain('heating.boilerSeasonalEfficiency'),
    boilerAuxiliaryElectricityKwhPerYear: reader.fixed('heating.boilerAuxiliaryElectricity'),
    heatPumpSpf: reader.uncertain(SCENARIO_ROWS[spfScenario].spf),
    heatPumpStandbyShare: reader.uncertain(SCENARIO_ROWS[spfScenario].standbyShare),
    copCurve,
    compensation,
  };
}

type HotWaterInputs = Pick<
  EngineInputs,
  | 'hotWaterLitresPerDay'
  | 'hotWaterDeliveryTemperatureC'
  | 'coldFeedTemperatureC'
  | 'cylinderStandingLossKwhPerDay'
  | 'hotWaterFlowTemperatureC'
  | 'cylinderVolumeLitres'
  | 'cylinderSetpointC'
  | 'cylinderMinimumC'
  | 'hotWaterDrawProfile'
>;

/** How far the draw-off shares may sum from 1 before reading fails. */
const PROFILE_SUM_TOLERANCE = 1e-9;

function readHotWater(reader: Reader, house: House): HotWaterInputs {
  const hotWaterDrawProfile = reader.profile('hotWater.drawOffProfile');
  const total = hotWaterDrawProfile.reduce((sum, share) => sum + share, 0);
  if (hotWaterDrawProfile.some((share) => share < 0) || Math.abs(total - 1) > PROFILE_SUM_TOLERANCE) {
    throw new Error(`The hot water draw-off profile must be non-negative shares summing to 1, got a sum of ${total}`);
  }
  return {
    hotWaterLitresPerDay: reader.fixed('hotWater.litresBase') + reader.uncertain('hotWater.litresPerOccupant') * house.occupants,
    hotWaterDeliveryTemperatureC: reader.fixed('hotWater.deliveryTemperature'),
    coldFeedTemperatureC: reader.fixed('hotWater.coldFeedTemperature'),
    cylinderStandingLossKwhPerDay: reader.fixed('hotWater.cylinderStandingLoss'),
    hotWaterFlowTemperatureC: reader.fixed('hotWater.heatPumpFlowTemperature'),
    cylinderVolumeLitres: reader.fixed('hotWater.cylinderVolume'),
    cylinderSetpointC: reader.fixed('hotWater.cylinderSetpoint'),
    cylinderMinimumC: reader.fixed('hotWater.cylinderMinimum'),
    hotWaterDrawProfile,
  };
}

type PriceInputs = Pick<
  EngineInputs,
  | 'electricityUnitRatePence'
  | 'electricityStandingChargePencePerDay'
  | 'gasUnitRatePence'
  | 'gasStandingChargePencePerDay'
  | 'gasCarbonKgPerKwh'
  | 'gridCarbonKgPerKwh'
  | 'baseElectricityKwhPerYear'
  | 'baseElectricityWeeklyProfile'
  | 'baseElectricityMonthlyProfile'
>;

function checkLevelProfile(id: RowId, values: readonly number[]): readonly number[] {
  if (values.some((value) => !(value >= 0)) || !values.some((value) => value > 0)) {
    throw new Error(`The profile "${id}" must be non-negative with at least one positive value`);
  }
  return values;
}

/** Prices, carbon factors and base electricity use. */
function readPrices(reader: Reader): PriceInputs {
  return {
    electricityUnitRatePence: reader.fixed('prices.electricityUnitRate'),
    electricityStandingChargePencePerDay: reader.fixed('prices.electricityStandingCharge'),
    gasUnitRatePence: reader.fixed('prices.gasUnitRate'),
    gasStandingChargePencePerDay: reader.fixed('prices.gasStandingCharge'),
    gasCarbonKgPerKwh: reader.fixed('carbon.gasFactor'),
    gridCarbonKgPerKwh: reader.fixed('carbon.gridElectricityFactor'),
    baseElectricityKwhPerYear: reader.uncertain('electricity.baseUse'),
    baseElectricityWeeklyProfile: checkLevelProfile('electricity.baseProfileWeekly', reader.profile('electricity.baseProfileWeekly')),
    baseElectricityMonthlyProfile: checkLevelProfile('electricity.baseProfileMonthly', reader.profile('electricity.baseProfileMonthly')),
  };
}

type SolarInputs = Pick<EngineInputs, 'pv' | 'pvRequestedPeakPowerKw' | 'pvRoofMaximumKw'>;

/** The PV system, with its size clipped to what one roof slope of the house takes. Tilt is also the roof pitch. */
function readSolar(reader: Reader, roofFootprintM2: number): SolarInputs {
  const tilt = reader.fixed('solar.tilt') * RADIANS_PER_DEGREE;
  const requested = reader.uncertain('solar.systemSize');
  const roofMaximum = roofMaximumKw({
    footprintM2: roofFootprintM2,
    pitch: tilt,
    usableFraction: reader.uncertain('solar.usableRoofFraction'),
    kwpPerM2: reader.fixed('solar.peakPowerPerArea'),
  });
  const pv: PvSystem = {
    peakPowerKw: Math.min(requested, roofMaximum),
    tilt,
    azimuth: reader.uncertain('solar.azimuth') * RADIANS_PER_DEGREE,
    systemLoss: reader.fixed('solar.systemLoss'),
    temperatureCoefficientPerK: reader.fixed('solar.temperatureCoefficient'),
    cellTemperatureRiseKPerWm2: reader.fixed('solar.cellTemperatureRise'),
  };
  checkPvSystem(pv);
  return { pv, pvRequestedPeakPowerKw: requested, pvRoofMaximumKw: roofMaximum };
}

/** Reads every subsystem in a fixed order, which sets the order `uncertainDraws` returns. */
function read(access: RegisterAccessor, house: House, reader: Reader, spfScenario: SpfScenario): EngineInputs {
  checkHouse(access, house);
  const facts = archetypeFacts(access, house.archetype);
  const geometry = readGeometry(access, reader, house, facts);
  return {
    house,
    outdoorTemperatureOffsetK: reader.fixed('weather.outdoorTemperatureOffset'),
    irradianceSampleMinute: reader.fixed('weather.irradianceSampleMinute'),
    ...geometry,
    ...readFabric(reader, house, facts),
    ...readGains(reader, house),
    ...readHeating(reader, spfScenario),
    ...readHotWater(reader, house),
    ...readPrices(reader),
    ...readSolar(reader, geometry.footprintM2),
  };
}

/**
 * Reads the engine's inputs for one house. Throws, naming the id or key, if a row or cell is missing or of the
 * wrong kind, if the house is invalid, or if an override names a value the house does not read.
 */
export function readInputs(access: RegisterAccessor, options: ReadInputsOptions = {}): EngineInputs {
  const { overrides = {}, spfScenario = 'fieldTrial' } = options;
  const house = options.house ?? defaultHouse(access, REFERENCE_ARCHETYPE);
  for (const [key, value] of Object.entries(overrides)) {
    if (!Number.isFinite(value)) throw new Error(`Override for "${key}" must be a finite number, got ${value}`);
  }
  const reader = new Reader(access, overrides);
  const inputs = read(access, house, reader, spfScenario);
  const drawn = new Set<string>(reader.draws.keys());
  for (const key of Object.keys(overrides)) {
    if (!drawn.has(key)) throw new Error(`Override for "${key}" names no uncertain value this house reads`);
  }
  return inputs;
}

/** Every uncertain row and cell a house reads under an SPF scenario, in the order the engine reads them. */
export function uncertainDraws(
  access: RegisterAccessor,
  house: House = defaultHouse(access, REFERENCE_ARCHETYPE),
  spfScenario: SpfScenario = 'fieldTrial',
): UncertainDraw[] {
  const reader = new Reader(access, {});
  read(access, house, reader, spfScenario);
  return [...reader.draws.values()];
}
