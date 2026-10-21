// ABOUT: Checks the phase 1 report on the real register and snapshot: offline, byte-identical between runs,
// ABOUT: free of timestamps, and holding every section the spec asks for, with the heat pump bias next to the comparison

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { band, byMetric, type Comparison } from '../../src/engine/compare.ts';
import { uncertainDraws } from '../../src/engine/inputs.ts';
import { combinationReads } from '../../src/engine/combinations.ts';
import { loadRegister } from '../../src/register/load.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { createAccessor } from '../../src/register/access.ts';
import { buildReport, marginPoints, outsideBandNotes, pricePeriod, REPORT_PLAN } from './build.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const register = loadRegister(readJson('../../data/register.json'));
const snapshot = loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json'));
const smallPlan = { seed: 1, count: 40 };
const report = buildReport(register, snapshot, smallPlan);

describe('buildReport', () => {
  it('gives byte-identical output on a second run', () => {
    expect(buildReport(register, snapshot, smallPlan)).toBe(report);
  });

  it('contains no timestamps, ends in one newline and uses only \\n line endings', () => {
    expect(report).not.toMatch(/\d{2}:\d{2}/);
    expect(report).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(report.endsWith('\n')).toBe(true);
    expect(report.endsWith('\n\n')).toBe(false);
    expect(report).not.toContain('\r');
  });

  it('has every section the spec asks for', () => {
    for (const heading of [
      '## The house',
      '### Gas boiler',
      '### Heat pump',
      '## Gas boiler versus heat pump',
      '## Sensitivity',
      '## How the ranges are made',
      '## Benchmark and calibration',
      '## Data dates',
      '## Limitations',
    ]) {
      expect(report).toContain(heading);
    }
  });

  it('states the seed and the sample count', () => {
    expect(report).toContain('40 joint samples with seed 1');
  });

  it('puts the heat pump bias (issue 15) inside the comparison section, and lists the shared setpoint as a limitation', () => {
    const comparison = report.slice(report.indexOf('## Gas boiler versus heat pump'), report.indexOf('## Sensitivity'));
    expect(comparison).toContain('issues/15');
    const heatPumpResults = report.slice(report.indexOf('### Heat pump'), report.indexOf('## Gas boiler versus heat pump'));
    expect(heatPumpResults).toContain('6.7 points');
    expect(heatPumpResults).toContain('issues/15');
    expect(comparison).toMatch(/cheaper to run in \d+% of samples/);
    const limitations = report.slice(report.indexOf('## Limitations'));
    expect(limitations).toContain('One calibrated setpoint applies to both setups');
  });

  it('lists every uncertain row either combination’s running cost reads in the sensitivity table, and no other', () => {
    const rows = report.slice(report.indexOf('## Sensitivity'), report.indexOf('## How the ranges are made'));
    // The house's draws in the field-trial scenario; the well-installed SPF and standby share are left out.
    const draws = uncertainDraws(createAccessor(register));
    const reads = draws.filter((draw) => combinationReads('gas/cap', draw.id) || combinationReads('heatPump/cap', draw.id)).map((draw) => draw.label);
    const unread = draws.filter((draw) => !reads.includes(draw.label)).map((draw) => `| ${draw.label} |`);
    expect(unread.length).toBeGreaterThan(0);
    for (const label of reads) expect(rows).toContain(label);
    for (const cell of unread) expect(rows).not.toContain(cell);
  });

  it('states the benchmark gaps and the decisions, including that the rule was amended after the result', () => {
    const benchmark = report.slice(report.indexOf('## Benchmark and calibration'), report.indexOf('## Data dates'));
    expect(benchmark).toContain('\u221215.7%');
    expect(benchmark).toContain('\u22124.6%');
    expect(benchmark).toContain('amended after seeing that result');
    expect(benchmark).toContain('Decision: proceed with no thermal mass');
    expect(benchmark).toContain('Decision: calibrate the heating behaviour');
    expect(benchmark).toContain('4.3% above HEM');
  });

  it('takes the price period from the price row’s label', () => {
    const access = createAccessor(register);
    expect(access.fixed('prices.electricityUnitRate').label.endsWith(`, ${pricePeriod(access)}`)).toBe(true);
    expect(pricePeriod(access)).toMatch(/\d{4}$/);
    expect(report).toContain(`for ${pricePeriod(access)}.`);
  });

  it('explains the hot water gap, reports the no-loft variant and names the NEED age band', () => {
    expect(report).toContain('hot water cylinder loses heat');
    expect(report).toContain('## The variant with no loft insulation');
    expect(report).toContain('1919–44 band');
  });

  it('uses 500 samples for the committed report', () => {
    expect(REPORT_PLAN.count).toBe(500);
  });
});

describe('outsideBandNotes', () => {
  const inside = band([1, 2, 3, 4, 5], 3);
  const outside = band([1, 2, 3, 4, 5], 0);
  const bands = byMetric(() => inside);
  const comparisonOf = (gasBands: typeof bands, difference: typeof inside): Comparison => ({
    reference: 'gas/cap',
    bands: { 'gas/cap': gasBands, 'heatPump/cap': bands },
    differences: { 'heatPump/cap': { costPounds: difference, carbonKg: difference } },
    shareCheapest: { 'gas/cap': 0.5, 'heatPump/cap': 0.5 },
    shareCheapestByTariff: { cap: { 'gas/cap': 0.5, 'heatPump/cap': 0.5 } },
    payback: {},
    solarPayback: {},
  });

  it('says nothing when every central value lies inside its band', () => {
    expect(outsideBandNotes(comparisonOf(bands, inside))).toEqual([]);
  });

  it('names each band whose central value lies outside it', () => {
    const notes = outsideBandNotes(comparisonOf({ ...bands, costPounds: outside }, outside));
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain('Gas boiler, running cost');
    expect(notes[1]).toContain('cost difference');
    expect(notes[2]).toContain('carbon difference');
  });
});

describe('marginPoints', () => {
  it('gives about ±4.4 points at a share of 0.5 with 500 samples, and at least 1', () => {
    expect(marginPoints(0.5, 500)).toBe(4);
    expect(marginPoints(1, 500)).toBe(1);
  });
});
