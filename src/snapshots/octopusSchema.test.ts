// ABOUT: Tests for the Octopus snapshot schema: the committed file validates, and a broken one fails with
// ABOUT: messages that name each field

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HALF_HOURS_PER_TYPICAL_YEAR, loadOctopusSnapshot } from './octopusSchema.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const parsed: unknown = JSON.parse(readFileSync(new URL('../../data/snapshots/octopus-london.json', import.meta.url), 'utf8'));

describe('loadOctopusSnapshot', () => {
  const snapshot = loadOctopusSnapshot(parsed);

  it('accepts the committed snapshot: a full typical year of Agile half-hours and 24 Cosy hours', () => {
    expect(snapshot.agile.halfHourlyIncVatPence).toHaveLength(HALF_HOURS_PER_TYPICAL_YEAR);
    expect(snapshot.cosy.unitRatesIncVatPence).toHaveLength(24);
    expect(snapshot.region).toBe('C');
  });

  it('records the 12-month Agile window, which carried 5% VAT until the window’s last hour', () => {
    expect([snapshot.agile.windowStart, snapshot.agile.windowEnd]).toEqual(['2025-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']);
    const ratios = snapshot.agile.halfHourlyIncVatPence.flatMap((incVat, slot) => {
      const excVat = snapshot.agile.halfHourlyExcVatPence[slot]!;
      return Math.abs(excVat) > 1 ? [incVat / excVat] : [];
    });
    expect(ratios.filter((ratio) => Math.abs(ratio - 1.05) < 1e-3).length / ratios.length).toBeGreaterThan(0.99);
  });

  it('names each field that is wrong, and any unexpected one', () => {
    if (!isRecord(parsed) || !isRecord(parsed.agile)) throw new Error('The committed snapshot is not an object');
    const broken = { ...parsed, extra: 1, agile: { ...parsed.agile, halfHourlyIncVatPence: [1, 2] }, region: 'A' };
    expect(() => loadOctopusSnapshot(broken)).toThrow(/field "agile.halfHourlyIncVatPence": column "halfHourlyIncVatPence" must have exactly 17520 half-hours/);
    expect(() => loadOctopusSnapshot(broken)).toThrow(/field "region"/);
    expect(() => loadOctopusSnapshot(broken)).toThrow(/unexpected field\(s\) extra/);
    expect(() => loadOctopusSnapshot(null)).toThrow(/The Octopus snapshot is invalid/);
    const wild = { ...parsed, agile: { ...parsed.agile, halfHourlyExcVatPence: Array.from({ length: HALF_HOURS_PER_TYPICAL_YEAR }, () => 9_999) } };
    expect(() => loadOctopusSnapshot(wild)).toThrow(/field "agile.halfHourlyExcVatPence.0": must be from -100 to 500 p\/kWh/);
  });
});
