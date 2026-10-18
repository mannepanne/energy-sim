// ABOUT: Test support: builds small inline fixture registers, so engine tests never depend on data/register.json
// ABOUT: The base values are the hand-calculated fixture house documented in REFERENCE/engine.md

import { createAccessor, type RegisterAccessor } from '../../register/access.ts';
import { ROW_IDS, type RowId } from '../../register/ids.ts';
import { loadRegister } from '../../register/load.ts';
import type { Register } from '../../register/schema.ts';
import { UNCERTAIN_ROW_IDS } from '../inputs.ts';

const UNCERTAIN_IDS: ReadonlySet<RowId> = new Set<RowId>(UNCERTAIN_ROW_IDS);

const SERIES_ID: RowId = 'weather.pvgisTypicalYearLondon';

/**
 * The fixture house: round numbers chosen so H can be checked by hand.
 * Fabric: walls 100 × 1.0 + windows 10 × 3.0 + door 2 × 2.5 + roof 50 × 0.5 + floor 50 × 0.8 = 200 W/K.
 * Ventilation: 0.33 × 0.8 ach × 250 m³ = 66 W/K. H = 266 W/K at a fabric quality factor of 1.
 */
export const FIXTURE_HOUSE: Readonly<Record<Exclude<RowId, typeof SERIES_ID>, number>> = {
  'weather.outdoorTemperatureOffset': 0,
  'weather.irradianceSampleMinute': 10,
  'geometry.totalFloorArea': 100,
  'geometry.storeyHeight': 2.5,
  'geometry.heatedVolume': 250,
  'geometry.exposedPerimeter': 20,
  'geometry.windowArea': 10,
  'geometry.doorArea': 2,
  'geometry.externalWallArea': 100,
  'geometry.roofArea': 50,
  'geometry.groundFloorArea': 50,
  'fabric.wallUValue': 1,
  'fabric.partyWallUValue': 0,
  'fabric.windowUValue': 3,
  'fabric.doorUValue': 2.5,
  'fabric.roofUValue': 0.5,
  'fabric.roofUValueNoLoftInsulation': 2,
  'fabric.groundFloorUValue': 0.8,
  'fabric.airChangeRate': 0.8,
  'fabric.qualityFactor': 1,
  'gains.internalGains': 400,
  'gains.windowGValue': 0.5,
  'gains.windowFrameFactor': 0.8,
  'gains.solarAccessFactor': 1,
  'gains.groundReflectance': 0.2,
  'heating.meanInternalTemperature': 20,
  'heating.boilerSeasonalEfficiency': 0.8,
  'heating.heatPumpSpf': 2.5,
  'hotWater.litresPerDay': 100,
  'hotWater.deliveryTemperature': 50,
  'hotWater.coldFeedTemperature': 10,
  'hotWater.cylinderStandingLoss': 1.5,
  'prices.electricityUnitRate': 25,
  'prices.electricityStandingCharge': 50,
  'prices.gasUnitRate': 8,
  'prices.gasStandingCharge': 30,
  'carbon.gasFactor': 0.2,
  'carbon.gridElectricityFactor': 0.1,
  'electricity.baseUse': 2920,
};

export type FixtureValues = Partial<typeof FIXTURE_HOUSE>;

function row(id: RowId, value: number | undefined): Record<string, unknown> {
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
  if (id === SERIES_ID) {
    return { ...base, kind: 'series', file: 'data/snapshots/pvgis-tmy-london.json', schema: 'pvgis-tmy', columns: ['T2m'] };
  }
  if (UNCERTAIN_IDS.has(id)) return { ...base, kind: 'uncertain', default: value, low: value, high: value, distribution: 'triangular' };
  return { ...base, kind: 'fixed', value };
}

/** A validated register holding every row id: the fixture house, with `values` replacing any of its numbers. */
export function fixtureRegister(values: FixtureValues = {}): Register {
  const merged: Record<string, number> = { ...FIXTURE_HOUSE, ...values };
  return loadRegister({ rows: ROW_IDS.map((id) => row(id, merged[id])) });
}

export function fixtureAccessor(values: FixtureValues = {}): RegisterAccessor {
  return createAccessor(fixtureRegister(values));
}
