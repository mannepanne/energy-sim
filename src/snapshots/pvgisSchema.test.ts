// ABOUT: Tests for the PVGIS snapshot schema on the committed London snapshot and on broken copies
// ABOUT: A missing column, the wrong hour count, out-of-order hours or a leap day each fail clearly

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOURS_PER_TYPICAL_YEAR, loadPvgisSnapshot, timestampProblem, type PvgisSnapshot } from './pvgisSchema.ts';

const raw = readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8');
const snapshot = loadPvgisSnapshot(JSON.parse(raw) as unknown);

const copy = (): PvgisSnapshot => structuredClone(snapshot);

describe('the committed London snapshot', () => {
  it('validates, with 8,760 UTC hours', () => {
    expect(snapshot.timezone).toBe('UTC');
    expect(snapshot.hours['time(UTC)']).toHaveLength(HOURS_PER_TYPICAL_YEAR);
    expect(snapshot.location).toMatchObject({ latitude: 51.507, longitude: -0.128 });
  });

  it('carries the JRC attribution', () => {
    expect(snapshot.attribution).toContain('PVGIS © European Union');
  });

  it('has a plausible London annual mean temperature (about 11.1 °C)', () => {
    const mean = snapshot.hours.T2m.reduce((sum, value) => sum + value, 0) / HOURS_PER_TYPICAL_YEAR;
    expect(mean).toBeGreaterThan(10.5);
    expect(mean).toBeLessThan(11.7);
  });
});

describe('loadPvgisSnapshot rejects', () => {
  it('a missing column, naming it', () => {
    const broken: Partial<PvgisSnapshot['hours']> = copy().hours;
    delete broken['Gb(n)'];
    expect(() => loadPvgisSnapshot({ ...snapshot, hours: broken })).toThrow(/field "hours.Gb\(n\)"/);
  });

  it('the wrong row count', () => {
    const broken = copy();
    broken.hours.T2m.pop();
    expect(() => loadPvgisSnapshot(broken)).toThrow('column "T2m" must have exactly 8760 hours');
  });

  it('negative irradiance', () => {
    const broken = copy();
    broken.hours['G(h)'][100] = -1;
    expect(() => loadPvgisSnapshot(broken)).toThrow(/field "hours.G\(h\).100"/);
  });

  it('an unexpected field', () => {
    expect(() => loadPvgisSnapshot({ ...snapshot, extra: true })).toThrow('unexpected field(s) extra');
  });

  it('a non-object, with a message at the top level', () => {
    expect(() => loadPvgisSnapshot(null)).toThrow(/^The PVGIS snapshot is invalid:\n- /);
  });

  it('a leap day', () => {
    const broken = copy();
    broken.hours['time(UTC)'][1416] = '20080229:0000';
    expect(() => loadPvgisSnapshot(broken)).toThrow('is a leap day');
  });
});

describe('timestampProblem', () => {
  const times = snapshot.hours['time(UTC)'];

  it('accepts the committed timestamps, whose source years differ by month', () => {
    expect(timestampProblem(times)).toBeUndefined();
    expect(new Set(times.map((time) => time.slice(0, 4))).size).toBeGreaterThan(1);
  });

  it('reports hours out of order', () => {
    const swapped = [...times];
    [swapped[10], swapped[11]] = [swapped[11]!, swapped[10]!];
    expect(timestampProblem(swapped)).toMatch(/^hour 10: .* is out of order; expected month-day hour 01-01 10:00 UTC$/);
  });

  it('reports a timestamp that is not on the hour', () => {
    expect(timestampProblem(['20160101:0030'])).toContain('out of order');
  });

  it('reports a malformed timestamp', () => {
    expect(timestampProblem(['2016-01-01T00:00'])).toContain('is not a PVGIS timestamp');
  });
});
