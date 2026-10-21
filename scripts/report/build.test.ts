// ABOUT: Checks the phase 2 report on the real register and snapshots: offline, byte-identical between runs, free of
// ABOUT: timestamps, holding every section the spec asks for, with the issue 15 bias and the time-of-use caveats where they belong

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combinationReads } from '../../src/engine/combinations.ts';
import { uncertainDraws } from '../../src/engine/inputs.ts';
import { CAPITAL_ROWS } from '../../src/engine/setups.ts';
import { agileFromSnapshot } from '../../src/engine/tariffs.ts';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { loadOctopusSnapshot } from '../../src/snapshots/octopusSchema.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { ARCHETYPE_NAMES } from '../archetypes/table.ts';
import { loadPvcalcSnapshot } from '../pvgis/pvcalc.ts';
import { agileLimitations, TIME_OF_USE_ASSUMPTIONS } from '../tariffs/table.ts';
import { buildReport, marginPoints, pricePeriod, REPORT_PATH, REPORT_PLAN, REPORT_PLANS } from './build.ts';
import { tableNotes } from './comparisons.ts';
import { readInputs } from '../../src/engine/inputs.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const register = loadRegister(readJson('../../data/register.json'));
const data = {
  register,
  pvgis: loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json')),
  octopus: loadOctopusSnapshot(readJson('../../data/snapshots/octopus-london.json')),
  pvcalc: loadPvcalcSnapshot(readJson('../../data/snapshots/pvgis-pvcalc-london.json')),
};
const smallPlans = { main: { seed: 1, count: 20 }, archetypes: { seed: 1, count: 4 } };
const report = buildReport(data, smallPlans);
const notes = tableNotes(readInputs(createAccessor(register)).electricityVatRate);

/** The report cut at every heading, each piece with its heading line first. */
const pieces = report.split(/\n(?=#{2,4} )/);
const hasTable = (piece: string): boolean => piece.includes('\n| --- |');
/** A table line naming a Cosy or Agile combination in any cell, such as "| Heat pump, Cosy |". */
const hasTimeOfUseRow = (piece: string): boolean => /\n\|[^\n]*\b(Cosy|Agile)\b[^\n]*\|/.test(piece);
/** Sections whose tables hold no setup's running cost or payback. */
const NOTE_FREE = ['## Time-of-use caveats', '### The Home Energy Model (HEM)', '### PVGIS’s PV calculator', '## Data dates'];

/** The text from one heading to the next heading of the same or a higher level. */
function section(heading: string): string {
  const start = report.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`No heading "${heading}"`);
  const level = heading.indexOf(' ');
  const rest = report.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

describe('buildReport', () => {
  it('gives byte-identical output on a second run', () => {
    expect(buildReport(data, smallPlans)).toBe(report);
  });

  it('contains no timestamps, ends in one newline, has no double blank lines and uses only \\n line endings', () => {
    expect(report).not.toMatch(/\d{2}:\d{2}/);
    expect(report).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(report.endsWith('\n')).toBe(true);
    expect(report.endsWith('\n\n')).toBe(false);
    expect(report).not.toContain('\n\n\n');
    expect(report).not.toContain('\r');
  });

  it('has every section the spec asks for', () => {
    for (const heading of [
      '## At a glance',
      '## The house',
      '## Results for the 10 combinations',
      '### Running cost',
      '### Carbon',
      '### Upfront cost after the grant',
      '### Payback against replacing the boiler',
      '## Time-of-use caveats',
      '### Paired differences against the reference',
      '### Which is cheapest to run',
      '### Solar’s own payback',
      '### Running cost, one row at a time',
      '### The heat pump on the gas schedule',
      '### Payback, one row at a time',
      '## The well-installed scenario',
      '## The archetype table',
      '### The Home Energy Model (HEM)',
      '### PVGIS’s PV calculator',
      '## How the ranges are made',
      '## Conventions',
      '## Data dates',
      '## Limitations',
    ]) {
      expect(report).toContain(`\n${heading}\n`);
    }
  });

  it('writes to the phase 2 report and uses 500 samples, and 200 for the archetypes', () => {
    expect(REPORT_PATH).toBe('reports/phase-2-v1-model.md');
    expect(REPORT_PLAN.count).toBe(500);
    expect(REPORT_PLANS.archetypes.count).toBe(200);
    expect(report).toContain('20 joint samples with seed 1');
  });

  it('states the issue 15 bias next to the headline heat pump numbers', () => {
    for (const heading of ['## At a glance', '### Running cost']) {
      expect(section(heading)).toContain('6.7 points');
      expect(section(heading)).toContain('issues/15');
    }
  });

  it('states every time-of-use assumption and Agile limitation in full, and the control table, in one section', () => {
    const caveats = section('## Time-of-use caveats');
    for (const line of [...TIME_OF_USE_ASSUMPTIONS, ...agileLimitations(agileFromSnapshot(data.octopus).window)]) expect(caveats).toContain(line);
    expect(caveats).toContain('Mean indoor temperature');
    expect(section('## At a glance')).toContain(notes.timeOfUse);
  });

  it('ends every table with Cosy or Agile rows with the time-of-use pointer, and every other results table with the VAT note', () => {
    const checked = pieces.filter((piece) => hasTable(piece) && !NOTE_FREE.some((heading) => piece.startsWith(heading)));
    expect(checked.length).toBeGreaterThan(15);
    for (const piece of checked) {
      const heading = piece.split('\n')[0];
      expect({ heading, noted: piece.includes(hasTimeOfUseRow(piece) ? notes.timeOfUse : notes.vat) }).toEqual({ heading, noted: true });
    }
    expect(hasTimeOfUseRow(section('### Energy, central'))).toBe(true);
    expect(section('#### Heat pump, price cap against gas boiler, price cap')).toContain(notes.vat);
  });

  it('says what drives the heat pump’s payback on the cap when it falls in the boiler’s replacement year', () => {
    for (const heading of ['## At a glance', '### Payback against replacing the boiler']) expect(section(heading)).toContain('like-for-like boiler would itself need replacing');
  });

  it('counts the samples in which the COP ceiling bound, in both scenarios', () => {
    expect(section('## How the ranges are made')).toMatch(/in \d+ of 20 samples in the field-trial scenario and \d+ in the well-installed one/);
  });

  it('shows each of the 10 combinations in the results, with payback in words where it has no year', () => {
    const results = section('## Results for the 10 combinations');
    for (const name of ['Gas boiler, price cap', 'Gas boiler with solar, Agile', 'Heat pump, Cosy', 'Heat pump with solar, Agile']) expect(results).toContain(`| ${name} |`);
    expect(section('### Payback against replacing the boiler')).toMatch(/beyond lifetime|\d+ years/);
  });

  it('lists every uncertain row the heat pump on the cap or the reference reads in their sensitivity table, and no other', () => {
    const rows = section('#### Heat pump, price cap against gas boiler, price cap');
    const draws = uncertainDraws(createAccessor(register));
    const reads = draws.filter((draw) => combinationReads('gas/cap', draw.id) || combinationReads('heatPump/cap', draw.id));
    for (const draw of reads) expect(rows).toContain(`| ${draw.label} |`);
    for (const draw of draws.filter((candidate) => !reads.includes(candidate))) expect(rows).not.toContain(`| ${draw.label} |`);
  });

  it('lists exactly the capital costs, lifetimes and price changes in the payback sensitivity', () => {
    const rows = section('### Payback, one row at a time');
    for (const draw of uncertainDraws(createAccessor(register))) {
      expect({ id: draw.id, listed: rows.includes(`| ${draw.label} |`) }).toEqual({ id: draw.id, listed: CAPITAL_ROWS.has(draw.id) });
    }
    expect(rows).toContain('| Every row at its default |');
  });

  it('runs the heat pump on the gas schedule and says the well-installed sample is self-selected', () => {
    expect(section('### The heat pump on the gas schedule')).toContain('| Heat pump, price cap |');
    expect(section('## The well-installed scenario')).toContain('self-selected');
  });

  it('shows every archetype with its NEED readings', () => {
    const table = section('## The archetype table');
    for (const name of Object.values(ARCHETYPE_NAMES)) expect(table).toContain(`| ${name} |`);
    expect(table).toContain('NEED T');
  });

  it('computes the HEM gaps the limitations state, and the PV check inside its tolerance', () => {
    const hem = section('### The Home Energy Model (HEM)');
    for (const gap of ['+4.3%', '−2.4%', '−8.4%', '−4.8%', '−6.7 points']) expect(hem).toContain(gap);
    const limitations = section('## Limitations');
    expect(limitations).toContain('4.3% high on SAP’s periods, 2.4% low on the heat pump’s day and 8.4% low');
    expect(section('### PVGIS’s PV calculator')).toContain('inside the 8% tolerance');
  });

  it('states the conventions and takes the price period from the price row’s label', () => {
    const conventions = section('## Conventions');
    for (const phrase of ['UTC', 'Thursday', 'no carbon credit', 'undiscounted', 'needs replacing now']) expect(conventions).toContain(phrase);
    const access = createAccessor(register);
    expect(access.fixed('prices.electricityUnitRate').label.endsWith(`, ${pricePeriod(access)}`)).toBe(true);
    expect(report).toContain(`for ${pricePeriod(access)}:`);
  });

  it('dates the Octopus and PVcalc snapshots', () => {
    const dates = section('## Data dates');
    expect(dates).toContain(`fetched on ${data.octopus.fetchedOn}`);
    expect(dates).toContain(`fetched on ${data.pvcalc.fetchedOn}`);
  });
});

describe('marginPoints', () => {
  it('gives about ±4.4 points at a share of 0.5 with 500 samples, and at least 1', () => {
    expect(marginPoints(0.5, 500)).toBe(4);
    expect(marginPoints(1, 500)).toBe(1);
  });
});
