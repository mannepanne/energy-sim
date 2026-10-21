// ABOUT: Test support: builds small inline fixture registers, so engine tests never depend on data/register.json
// ABOUT: The base values are the hand-calculated fixture house documented in REFERENCE/engine.md

import { createAccessor, type RegisterAccessor } from '../../register/access.ts';
import { ROW_IDS, type RowId } from '../../register/ids.ts';
import { loadRegister } from '../../register/load.ts';
import type { Register, TableKeyKind } from '../../register/schema.ts';
import { ARCHETYPE_KEYS, GLAZING_ANSWERS, LOFT_ANSWERS, WALL_ANSWERS, WALL_CONSTRUCTIONS } from '../archetypes.ts';
import { UNCERTAIN_ROW_IDS, type UncertainRowId } from '../inputs.ts';

const UNCERTAIN_IDS: ReadonlySet<RowId> = new Set<RowId>(UNCERTAIN_ROW_IDS);
const isUncertain = (id: RowId): id is UncertainRowId => UNCERTAIN_IDS.has(id);

const SERIES_FILES = {
  'weather.pvgisTypicalYearLondon': { file: 'data/snapshots/pvgis-tmy-london.json', schema: 'pvgis-tmy', columns: ['T2m'] },
  'tariffs.octopusLondon': { file: 'data/snapshots/octopus-london.json', schema: 'octopus-london', columns: ['agile.halfHourlyExcVatPence'] },
} as const;
type SeriesId = keyof typeof SERIES_FILES;
const isSeries = (id: RowId): id is SeriesId => id in SERIES_FILES;
/** The fixture's correlation rows and the two rows each is between, anchor first. */
const CORRELATIONS: Readonly<Partial<Record<RowId, readonly [UncertainRowId, UncertainRowId]>>> = {
  'gains.perOccupantHotWaterCorrelation': ['gains.perOccupant', 'hotWater.litresPerOccupant'],
  'prices.realChangeCorrelation': ['prices.gasRealChange', 'prices.electricityRealChange'],
};
const PROFILE_RESOLUTIONS: Readonly<Partial<Record<RowId, 'hour-of-day' | 'hour-of-week' | 'month'>>> = {
  'hotWater.drawOffProfile': 'hour-of-day',
  'electricity.baseProfileWeekly': 'hour-of-week',
  'heating.scheduleGas': 'hour-of-week',
  'heating.scheduleHeatPump': 'hour-of-week',
  'electricity.baseProfileMonthly': 'month',
  'tariffs.cosyUnitRate': 'hour-of-day',
};

/** An even hour-of-day profile: 1/24 in every hour. */
export const EVEN_DAILY_PROFILE: readonly number[] = Array.from({ length: 24 }, () => 1 / 24);

/** An even hour-of-week profile: 1 in every hour. */
export const EVEN_WEEKLY_PROFILE: readonly number[] = Array.from({ length: 168 }, () => 1);

/** A heating schedule that heats in every hour of the week. */
export const CONTINUOUS_SCHEDULE: readonly number[] = EVEN_WEEKLY_PROFILE;

/** A Cosy-like day by local hour: 10p from 04:00 to 07:00, 40p from 16:00 to 19:00 and 20p otherwise. */
export const FIXTURE_COSY_RATES: readonly number[] = Array.from({ length: 24 }, (_, hour) => (hour >= 4 && hour < 7 ? 10 : hour >= 16 && hour < 19 ? 40 : 20));

/** An even month profile: 1 in every month. */
export const EVEN_MONTHLY_PROFILE: readonly number[] = Array.from({ length: 12 }, () => 1);

/** Every age band an archetype uses. A fixture table keyed by band has a cell for each. */
export const FIXTURE_BANDS = ['A', 'C', 'D', 'E', 'F', 'G', 'K', 'L'] as const;

/** A table value: one value for every key, or a value for each key. */
export type FixtureCells = number | string | readonly number[] | Readonly<Record<string, number | string>>;


const archetypeKeyed = [...ARCHETYPE_KEYS];
const bandKeyed = [...FIXTURE_BANDS];
const wallKeys = FIXTURE_BANDS.flatMap((band) => WALL_CONSTRUCTIONS.flatMap((construction) => WALL_ANSWERS.map((answer) => `${band}/${construction}/${answer}`)));
const bandConstructionKeys = FIXTURE_BANDS.flatMap((band) => WALL_CONSTRUCTIONS.map((construction) => `${band}/${construction}`));

/** The keys of each table row, with what they are keyed by. */
const TABLE_KEYS: Readonly<Partial<Record<RowId, { keyedBy: TableKeyKind; keys: readonly string[] }>>> = {
  'archetypes.houseType': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.ageBand': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.storeys': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.wallConstruction': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.floorArea': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.bedrooms': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.aspectRatio': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.partyWalls': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.defaultLoftAnswer': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.defaultWallAnswer': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.defaultGlazingAnswer': { keyedBy: 'archetype', keys: archetypeKeyed },
  'archetypes.roomHeight': { keyedBy: 'age band', keys: bandKeyed },
  'archetypes.windowAreaSlope': { keyedBy: 'age band', keys: bandKeyed },
  'archetypes.windowAreaIntercept': { keyedBy: 'age band', keys: bandKeyed },
  'archetypes.wallThickness': { keyedBy: 'age band/construction', keys: bandConstructionKeys },
  'archetypes.groundFloorConstruction': { keyedBy: 'age band', keys: bandKeyed },
  'archetypes.groundFloorInsulation': { keyedBy: 'age band', keys: bandKeyed },
  'archetypes.occupancy': { keyedBy: 'coefficient', keys: ['base', 'saturation', 'curvature', 'slope', 'minimumFloorArea'] },
  'fabric.wallUValue': { keyedBy: 'age band/construction/answer', keys: wallKeys },
  'fabric.partyWallUValue': { keyedBy: 'construction', keys: [...WALL_CONSTRUCTIONS] },
  'fabric.thermalMassParameter': { keyedBy: 'construction', keys: [...WALL_CONSTRUCTIONS] },
  'fabric.windowUValue': { keyedBy: 'glazing answer', keys: [...GLAZING_ANSWERS] },
  'fabric.doorUValue': { keyedBy: 'age band', keys: bandKeyed },
  'fabric.roofUValue': { keyedBy: 'loft answer', keys: [...LOFT_ANSWERS] },
  'fabric.thermalBridging': { keyedBy: 'age band', keys: bandKeyed },
  'fabric.airChangeRate': { keyedBy: 'age band', keys: bandKeyed },
  'fabric.groundFloor': {
    keyedBy: 'parameter',
    keys: [
      'soilConductivity',
      'internalSurfaceResistance',
      'externalSurfaceResistance',
      'insulationConductivity',
      'deckResistance',
      'heightAboveGround',
      'windSpeed',
      'windShielding',
      'ventilationOpeningsPerMetre',
      'underfloorWallUValue',
    ],
  },
  'gains.windowGValue': { keyedBy: 'glazing answer', keys: [...GLAZING_ANSWERS] },
};

/**
 * The fixture house: round numbers chosen so H can be checked by hand. Every archetype key and age band gets the
 * same values. 100 m² over two storeys of 2.5 m (no upper-storey allowance), a 5 m × 10 m footprint with one party
 * wall: exposed perimeter 20 m, gross wall 100 m², windows 10 m², door 2 m², net wall 88 m².
 * Fabric: walls 88 × 1.0 + windows 10 × 3.0 + door 2 × 2.5 + roof 50 × 0.5 + floor 50 × 0.62 = 179 W/K.
 * Ventilation: 0.33 × 0.8 ach × 250 m³ = 66 W/K. H = 245 W/K at a fabric quality factor of 1.
 */
export const FIXTURE_HOUSE: Readonly<Record<Exclude<RowId, SeriesId>, FixtureCells>> = {
  'weather.outdoorTemperatureOffset': 0,
  'weather.irradianceSampleMinute': 10,
  'archetypes.houseType': 'semiDetached',
  'archetypes.ageBand': 'C',
  'archetypes.storeys': 2,
  'archetypes.wallConstruction': 'cavity',
  'archetypes.floorArea': 100,
  'archetypes.bedrooms': 3,
  'archetypes.aspectRatio': 2,
  'archetypes.partyWalls': 1,
  'archetypes.defaultLoftAnswer': 'about100mm',
  'archetypes.defaultWallAnswer': 'asBuilt',
  'archetypes.defaultGlazingAnswer': 'olderDouble',
  'archetypes.roomHeight': 2.5,
  'archetypes.upperStoreyAllowance': 0,
  'archetypes.windowAreaSlope': 0.1,
  'archetypes.windowAreaIntercept': 0,
  'archetypes.wallThickness': 250,
  'archetypes.groundFloorConstruction': 'solid',
  'archetypes.groundFloorInsulation': 0,
  // N = 4 at every floor area, so internal gains and hot water are round numbers.
  'archetypes.occupancy': { base: 4, saturation: 0, curvature: 0, slope: 0, minimumFloorArea: 0 },
  'geometry.doorArea': 2,
  'fabric.wallUValue': 1,
  'fabric.partyWallUValue': 0,
  'fabric.windowUValue': 3,
  'fabric.windowCurtainResistance': 0,
  'fabric.doorUValue': 2.5,
  'fabric.roofUValue': { none: 2, about100mm: 0.5, '270mmOrMore': 0.2 },
  'fabric.thermalBridging': 0,
  'fabric.airChangeRate': 0.8,
  'fabric.groundFloor': {
    soilConductivity: 1.5,
    internalSurfaceResistance: 0.17,
    externalSurfaceResistance: 0.04,
    insulationConductivity: 0.035,
    deckResistance: 0.2,
    heightAboveGround: 0.3,
    windSpeed: 5,
    windShielding: 0.05,
    ventilationOpeningsPerMetre: 0.003,
    underfloorWallUValue: 1.5,
  },
  'fabric.qualityFactor': 1,
  'gains.perFloorArea': 0,
  'gains.perOccupant': 100,
  'gains.perOccupantHotWaterCorrelation': 0,
  'gains.windowGValue': 0.5,
  'gains.nonNormalIncidenceFactor': 1,
  'gains.windowFrameFactor': 0.8,
  'gains.solarAccessFactor': 1,
  'gains.groundReflectance': 0.2,
  // Heated in every hour at 20 °C, so under steady weather the thermal mass never matters and every hour is the same.
  'heating.setpoint': 20,
  'heating.scheduleGas': CONTINUOUS_SCHEDULE,
  'heating.scheduleHeatPump': CONTINUOUS_SCHEDULE,
  // 250 × 100 m² = 25,000 kJ/K = 6,944 Wh/K: a time constant of 28 hours at H = 245 W/K.
  'fabric.thermalMassParameter': 250,
  // Caps well above the fixture's 3,275 W, so they bind only where a test sets them: 24 kW, and 245 × 24 × 1 = 5,880 W.
  'heating.boilerRatedOutput': 24,
  'heating.designTemperatureDifference': 24,
  'heating.heatPumpOutputMargin': 1,
  'heating.controlBoost': 1.5,
  'heating.preheatLeadTime': 3,
  'heating.boilerSeasonalEfficiency': 0.8,
  'heating.heatPumpSpf': 2.5,
  'heating.heatPumpSpfWellInstalled': 3.5,
  'heating.copLiftAllowance': 10,
  'heating.copShapeFloor': 4,
  'heating.copShapeCeiling': 15,
  'heating.copCeiling': 7,
  // Zero, so every hour's COP is k × shape; the standby tests set it.
  'heating.heatPumpStandbyShare': 0,
  'heating.heatPumpStandbyShareWellInstalled': 0,
  'heating.compensationDesignOutdoorTemperature': -2,
  'heating.compensationMildOutdoorTemperature': 15,
  'heating.flowTemperatureAtDesign': 45,
  'heating.flowTemperatureAtMild': 30,
  // Zero, so the gas setup's electricity is base use alone; the auxiliary tests set it.
  'heating.boilerAuxiliaryElectricity': 0,
  'hotWater.litresBase': 20,
  'hotWater.litresPerOccupant': 20,
  'hotWater.heatPumpFlowTemperature': 55,
  'hotWater.cylinderVolume': 200,
  'hotWater.cylinderSetpoint': 50,
  'hotWater.cylinderMinimum': 45,
  // Even, so the combi's hot water is the same in every hour.
  'hotWater.drawOffProfile': EVEN_DAILY_PROFILE,
  'hotWater.deliveryTemperature': 50,
  'hotWater.coldFeedTemperature': 10,
  'hotWater.cylinderStandingLoss': 1.5,
  'prices.electricityUnitRate': 25,
  'prices.electricityStandingCharge': 50,
  'prices.gasUnitRate': 8,
  'prices.gasStandingCharge': 30,
  'prices.electricityVatRate': 0,
  'prices.exportRate': 10,
  // No real price change, so every year costs what the first does unless a test sets one.
  'prices.gasRealChange': 0,
  'prices.electricityRealChange': 0,
  'prices.realChangeCorrelation': 0,
  'carbon.gasFactor': 0.2,
  'carbon.gridElectricityFactor': 0.1,
  'electricity.baseUse': 2920,
  // Even, so base use is 2,920 ÷ 8,760 = 1/3 kWh in every hour.
  'electricity.baseProfileWeekly': EVEN_WEEKLY_PROFILE,
  'electricity.baseProfileMonthly': EVEN_MONTHLY_PROFILE,
  // A 4 kWp south-facing system at 35°. No temperature effect and a 10% loss, so generation is 3.6 kWh per kWh/m² on
  // the panel. The roof takes 50 ÷ cos 35° × ½ × 1 × 0.2 = 6.10 kWp, so 4 kWp is not clipped.
  'solar.systemSize': 4,
  'solar.tilt': 35,
  'solar.azimuth': 0,
  'solar.systemLoss': 0.1,
  'solar.temperatureCoefficient': 0,
  'solar.cellTemperatureRise': 0,
  'solar.usableRoofFraction': 1,
  'solar.peakPowerPerArea': 0.2,
  // Round costs and lifetimes, so payback can be checked by hand.
  'costs.boilerInstalled': 2000,
  'costs.heatPumpInstalled': 12000,
  'costs.pvPerKwp': 1500,
  'costs.boilerUpgradeSchemeGrant': 7500,
  'costs.heatPumpLifetime': 18,
  'costs.boilerLifetime': 12,
  'costs.pvLifetime': 25,
  'tariffs.cosyUnitRate': FIXTURE_COSY_RATES,
  'tariffs.cosyStandingCharge': 40,
  'tariffs.agileStandingCharge': 35,
  'tariffs.agileCheapPeakShare': 0.25,
};

export type FixtureValues = Partial<typeof FIXTURE_HOUSE>;

/** A range for an uncertain fixture row: triangular with its value as the mode, or lognormal when `sigma` is given. */
export interface FixtureRange {
  low: number;
  high: number;
  sigma?: number;
}

export type FixtureRanges = Partial<Record<UncertainRowId, FixtureRange>>;

function uncertainFields(value: number, range: FixtureRange | undefined): Record<string, unknown> {
  if (!range) return { default: value, low: value, high: value, distribution: 'triangular' };
  const { low, high, sigma } = range;
  return sigma === undefined
    ? { default: value, low, high, distribution: 'triangular' }
    : { default: value, low, high, distribution: 'lognormal', median: value, sigma };
}

const isValueList = (value: FixtureCells | undefined): value is readonly number[] => Array.isArray(value);

function profileValues(id: RowId, value: FixtureCells | undefined): readonly number[] {
  if (!isValueList(value)) throw new Error(`Fixture row "${id}" needs an array of values`);
  return value;
}

function numberValue(id: RowId, value: FixtureCells | undefined): number {
  if (typeof value !== 'number') throw new Error(`Fixture row "${id}" needs a number`);
  return value;
}

function cells(id: RowId, value: FixtureCells | undefined, keys: readonly string[]): Record<string, unknown>[] {
  if (value === undefined) throw new Error(`Fixture row "${id}" has no value`);
  if (isValueList(value)) throw new Error(`Fixture row "${id}" is a table and needs a value or a value per key`);
  return keys.map((key) => {
    const cell = typeof value === 'object' ? value[key] : value;
    if (cell === undefined) throw new Error(`Fixture row "${id}" has no value for key "${key}"`);
    return { key, value: cell };
  });
}

function row(id: RowId, value: FixtureCells | undefined, ranges: FixtureRanges): Record<string, unknown> {
  const section = id.split('.')[0];
  const base = {
    id,
    section,
    label: `Fixture ${id}`,
    unit: 'fixture',
    status: 'approximate',
    rationale: 'Inline test fixture.',
    lastChecked: '2026-10-18',
    refreshCadence: 'static',
    overridable: false,
    overrideHint: null,
    dependsOn: [],
  };
  if (isSeries(id)) return { ...base, kind: 'series', ...SERIES_FILES[id], columns: [...SERIES_FILES[id].columns] };
  const between = CORRELATIONS[id];
  if (between) return { ...base, kind: 'correlation', value: numberValue(id, value), between, dependsOn: [...between] };
  const resolution = PROFILE_RESOLUTIONS[id];
  if (resolution) return { ...base, kind: 'profile', values: profileValues(id, value), resolution };
  if (isUncertain(id)) return { ...base, kind: 'uncertain', ...uncertainFields(numberValue(id, value), ranges[id]) };
  const table = TABLE_KEYS[id];
  if (table) return { ...base, kind: 'table', keyedBy: table.keyedBy, cells: cells(id, value, table.keys) };
  return { ...base, kind: 'fixed', value: numberValue(id, value) };
}

/**
 * A validated register holding every row id: the fixture house, with `values` replacing any of its values.
 * Uncertain rows have no range (low = high = default) unless `ranges` gives one.
 */
export function fixtureRegister(values: FixtureValues = {}, ranges: FixtureRanges = {}): Register {
  const merged: Partial<Record<RowId, FixtureCells>> = { ...FIXTURE_HOUSE, ...values };
  return loadRegister({ rows: ROW_IDS.map((id) => row(id, merged[id], ranges)) });
}

export function fixtureAccessor(values: FixtureValues = {}, ranges: FixtureRanges = {}): RegisterAccessor {
  return createAccessor(fixtureRegister(values, ranges));
}
