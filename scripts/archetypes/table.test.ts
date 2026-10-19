// ABOUT: Tests for the archetype table: one row per archetype, the gap and flag from the pre-registered rule,
// ABOUT: and byte-identical Markdown between runs

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_KEYS } from '../../src/engine/archetypes.ts';
import { readInputs } from '../../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { archetypeGap, needReadings } from './needReadings.ts';
import { ARCHETYPE_NAMES, ARCHETYPE_PLAN, archetypeRows, archetypeTable } from './table.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = createAccessor(loadRegister(readJson('../../data/register.json')));
const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json'))), readInputs(access));
const plan = { seed: 1, count: 20 };
const rows = archetypeRows(access, weather, plan);

describe('the archetype table', () => {
  it('has one row per archetype, in the spec’s order, each with a name', () => {
    expect(rows.map((row) => row.archetype)).toEqual([...ARCHETYPE_KEYS]);
    for (const key of ARCHETYPE_KEYS) expect(ARCHETYPE_NAMES[key]).not.toBe('');
  });

  it('applies the pre-registered readings and flag rule to each archetype’s central gas use', () => {
    for (const row of rows) {
      expect(row.readings).toEqual(needReadings(row.archetype));
      expect(row.gap).toEqual(archetypeGap(row.gasKwh.central, row.readings));
    }
  });

  it('puts the 1930s semi inside its interval, as the calibration targets the midpoint', () => {
    const semi = rows.find((row) => row.archetype === 'semi1930s')!;
    expect(Math.abs(semi.gasKwh.central - 13_200)).toBeLessThan(150);
    expect(semi.gap.flagged).toBe(false);
  });

  it('renders Markdown with a row per archetype, the sampling plan and the flag, identically on a second run', () => {
    const table = archetypeTable(rows, plan);
    expect(table).toBe(archetypeTable(archetypeRows(access, weather, plan), plan));
    expect(table).toContain('from 20 samples (seed 1)');
    expect(table.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Archetype') && !line.startsWith('| ---'))).toHaveLength(10);
    const flagged = { ...rows[0]!, gap: { gap: -0.3, flagged: true } };
    expect(archetypeTable([flagged], plan)).toContain('| −30% | **flagged** |');
    expect(archetypeTable([{ ...rows[0]!, gap: { gap: 0, flagged: false } }], plan)).toContain('| inside |  |');
    expect(table.endsWith('\n')).toBe(true);
  });

  it('uses 200 samples for the printed table', () => {
    expect(ARCHETYPE_PLAN.count).toBe(200);
  });
});
