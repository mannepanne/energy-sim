// ABOUT: Tests on the real data/register.json: it validates, its ids match the RowId union exactly,
// ABOUT: and the accessor returns rows by id and kind, throwing an error naming any unknown id

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from './access.ts';
import { ROW_IDS } from './ids.ts';
import { loadRegister } from './load.ts';
import { pvgisSnapshotSchema } from '../snapshots/pvgisSchema.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const register = loadRegister(readJson('../../data/register.json'));
const access = createAccessor(register);

describe('data/register.json', () => {
  it('validates against the register schema', () => {
    expect(register.rows.length).toBe(ROW_IDS.length);
  });

  it('has exactly the ids in the RowId union (id parity)', () => {
    expect(new Set(ROW_IDS).size).toBe(ROW_IDS.length);
    expect(register.rows.map((row) => row.id).toSorted()).toEqual(ROW_IDS.toSorted());
  });

  it('names an existing snapshot file whose columns cover the series row', () => {
    const series = access.series('weather.pvgisTypicalYearLondon');
    const snapshot = pvgisSnapshotSchema.parse(readJson(`../../${series.file}`));
    expect(series.schema).toBe(snapshot.schema);
    for (const column of series.columns) expect(Object.keys(snapshot.hours)).toContain(column);
  });

  it('holds no derived geometry rows: the engine derives areas and volume', () => {
    const ids: readonly string[] = ROW_IDS;
    for (const id of ['geometry.totalFloorArea', 'geometry.heatedVolume', 'geometry.externalWallArea', 'geometry.windowArea', 'fabric.groundFloorUValue']) {
      expect(ids).not.toContain(id);
    }
  });

  it('records the calibration on the mean internal temperature row', () => {
    const row = access.uncertain('heating.meanInternalTemperature');
    expect(row.source?.title).toContain('NEED');
    expect(row.rationale).toContain('air temperature');
    expect(row.rationale).toContain('13,200 kWh');
    expect(row.rationale).toContain('both setups');
    expect(row.rationale).toContain('fabric error');
    expect(row.dependsOn).toContain('heating.boilerSeasonalEfficiency');
    expect(row.dependsOn).toContain('hotWater.litresPerOccupant');
    expect(row.dependsOn).toContain('fabric.qualityFactor');
  });

  it('fits the SPF row to its target shares above 3.0 and 3.5', () => {
    const row = access.uncertain('heating.heatPumpSpf');
    expect(row.distribution).toBe('lognormal');
    const shareAbove = (x: number): number => 1 - normalCdf(Math.log(x / row.median!) / row.sigma!);
    expect(shareAbove(3.0)).toBeCloseTo(0.32, 2);
    expect(shareAbove(3.5)).toBeCloseTo(0.06, 2);
  });

  it('keeps PV’s shortest lifetime at least the heat pump’s longest, in whole years, so PV is never replaced inside a heat pump horizon', () => {
    const pv = access.uncertain('costs.pvLifetime');
    const heatPump = access.uncertain('costs.heatPumpLifetime');
    expect(Math.round(pv.low)).toBeGreaterThanOrEqual(Math.round(heatPump.high));
  });

  it('spans the export tariffs from the fixed Smart Export Guarantee to Outgoing Octopus’s earlier rate', () => {
    const exportRate = access.uncertain('prices.exportRate');
    expect([exportRate.low, exportRate.default, exportRate.high]).toEqual([4.1, 12, 15]);
  });

  it('reproduces the spec’s worked price check to within 0.01p', () => {
    const heatPumpPencePerKwh = access.fixed('prices.electricityUnitRate').value / 2.8;
    const boilerPencePerKwh = access.fixed('prices.gasUnitRate').value / 0.85;
    expect(Math.abs(heatPumpPencePerKwh - 9.4)).toBeLessThan(0.01);
    expect(Math.abs(boilerPencePerKwh - 9.38)).toBeLessThan(0.01);
    expect((access.fixed('prices.gasStandingCharge').value * 365) / 100).toBeCloseTo(108.33, 2);
  });
});

describe('createAccessor', () => {
  it('returns a row of the requested kind', () => {
    expect(access.fixed('geometry.doorArea').value).toBe(1.85);
    expect(access.uncertain('fabric.qualityFactor').default).toBe(1);
    expect(access.row('weather.pvgisTypicalYearLondon').kind).toBe('series');
  });

  it('throws an error naming an unknown id', () => {
    // An empty register lacks every id, as a stale RowId union or untyped caller would meet at run time.
    const empty = createAccessor(loadRegister({ rows: [] }));
    expect(() => empty.row('geometry.doorArea')).toThrow('Register has no row with id "geometry.doorArea"');
    expect(() => empty.fixed('geometry.doorArea')).toThrow('"geometry.doorArea"');
    expect(() => empty.cell('fabric.roofUValue', 'none')).toThrow('"fabric.roofUValue"');
  });

  it('throws when the row is of a different kind', () => {
    expect(() => access.fixed('fabric.qualityFactor')).toThrow(
      'Register row "fabric.qualityFactor" has kind "uncertain", not "fixed"',
    );
    expect(() => access.profile('geometry.doorArea')).toThrow('not "profile"');
    expect(() => access.cell('geometry.doorArea', 'A')).toThrow('has kind "fixed", not "table"');
  });

  it('reads table cells by key, throwing an error naming the row and an unknown key', () => {
    expect(access.cellNumber('fabric.roofUValue', 'none')).toBe(2.3);
    expect(access.cellString('archetypes.ageBand', 'semi1930s')).toBe('C');
    expect(access.cell('fabric.doorUValue', 'K')).toEqual({ key: 'K', value: 2 });
    expect(() => access.cell('fabric.roofUValue', 'lots')).toThrow('Register row "fabric.roofUValue" has no cell with key "lots"');
    expect(() => access.cellNumber('archetypes.ageBand', 'semi1930s')).toThrow('holds text ("C"), not a number');
    expect(() => access.cellString('fabric.roofUValue', 'none')).toThrow('holds a number (2.3), not text');
  });

  it('refuses a fixed read of an uncertain cell, and lists the correlation rows', () => {
    const rows = register.rows.map((row) =>
      row.id === 'fabric.doorUValue' && row.kind === 'table' ? { ...row, cells: [{ key: 'A', default: 3, low: 2, high: 4, distribution: 'triangular' as const }] } : row,
    );
    const withUncertainCell = createAccessor(loadRegister({ rows }));
    expect(() => withUncertainCell.cellNumber('fabric.doorUValue', 'A')).toThrow('"fabric.doorUValue", key "A" is an uncertain cell, not a fixed one');
    expect(access.correlations().map((row) => row.id)).toEqual(['gains.perOccupantHotWaterCorrelation', 'prices.realChangeCorrelation']);
    expect(access.correlation('gains.perOccupantHotWaterCorrelation').between).toEqual(['gains.perOccupant', 'hotWater.litresPerOccupant']);
  });
});

/** Standard normal CDF (Abramowitz and Stegun 26.2.17), accurate to about 1e-7. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - tail : tail;
}
