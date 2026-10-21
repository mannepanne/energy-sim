// ABOUT: Checks the report's table helpers on small hand-made comparisons: skew notes, the time-of-use pointer
// ABOUT: and how a row's low and high are written for pounds, per-unit pounds and other units

import { describe, expect, it } from 'vitest';
import { band, byMetric, type Comparison } from '../../src/engine/compare.ts';
import { metricTable, tableNotes, valueRange } from './comparisons.ts';

const notes = tableNotes(0);

const inside = band([1, 2, 3, 4, 5], 3);
const outside = band([1, 2, 3, 4, 5], 0);

const comparisonOf = (heatPumpCost: typeof inside, tariff: 'cap' | 'cosy'): Comparison => {
  const option = tariff === 'cap' ? 'heatPump/cap' : 'heatPump/cosy';
  return {
    reference: 'gas/cap',
    bands: { 'gas/cap': byMetric(() => inside), [option]: { ...byMetric(() => inside), costPounds: heatPumpCost } },
    differences: {},
    shareCheapest: {},
    shareCheapestByTariff: {},
    payback: {},
    solarPayback: {},
  };
};

describe('metricTable', () => {
  it('says nothing about skew when every central value lies inside its band, and no pointer on the cap alone', () => {
    const table = metricTable(comparisonOf(inside, 'cap'), 'costPounds', 'A year', String, notes);
    expect(table).not.toContain('outside');
    expect(table).not.toContain(notes.timeOfUse);
    expect(table.endsWith(notes.vat)).toBe(true);
  });

  it('names each combination whose central value lies outside its band, and points to the caveats for Cosy', () => {
    const table = metricTable(comparisonOf(outside, 'cosy'), 'costPounds', 'A year', String, notes);
    expect(table).toContain('outside the 10th to 90th percentile for Heat pump, Cosy, because');
    expect(table.endsWith(notes.timeOfUse)).toBe(true);
  });
});

describe('tableNotes', () => {
  it('writes the VAT rate from the register row into both notes', () => {
    const atFive = tableNotes(0.05);
    expect(atFive.timeOfUse).toContain('5% VAT on electricity');
    expect(atFive.vat).toContain('carries 5% VAT today');
    expect(notes.vat).toContain('carries 0% VAT today');
  });
});

describe('valueRange', () => {
  it('writes pounds with the sign, per-unit pounds with "per", and other units after the numbers', () => {
    expect(valueRange(8_000, 22_000, '£')).toBe('£8,000 to £22,000');
    expect(valueRange(1_250, 2_500, '£/kWp')).toBe('£1,250 to £2,500 per kWp');
    expect(valueRange(16.2, 18.8, '°C')).toBe('16.2 to 18.8 °C');
    expect(valueRange(0.75, 1.15, 'ratio')).toBe('0.75 to 1.15');
  });
});
