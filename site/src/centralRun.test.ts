// ABOUT: Tests the site's central run against the phase 2 report's central values for the reference house
// ABOUT: Reads the committed register and weather snapshot, which the browser receives already validated

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadRegister } from '../../src/register/load.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { centralOnCap } from './centralRun.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const data = {
  register: loadRegister(readJson('../../data/register.json')),
  weather: loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')),
};
const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

describe('centralOnCap', () => {
  it('gives the report\'s central running cost and carbon for each setup, at display rounding', () => {
    // From reports/phase-2-v1-model.md: the comparison table's central values on the price cap.
    const rows = centralOnCap(data).map((row) => ({
      setup: row.setup,
      pounds: roundTo(row.totalPounds, 10),
      carbonKg: roundTo(row.carbonKg, 10),
    }));
    expect(rows).toEqual([
      { setup: 'gas', pounds: 2040, carbonKg: 2790 },
      { setup: 'gasSolar', pounds: 1410, carbonKg: 2630 },
      { setup: 'heatPump', pounds: 1940, carbonKg: 970 },
      { setup: 'heatPumpSolar', pounds: 1240, carbonKg: 720 },
    ]);
  });
});
