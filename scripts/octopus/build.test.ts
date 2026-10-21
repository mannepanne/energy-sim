// ABOUT: Tests for building the Octopus snapshot: Agile placed on the typical year, Cosy by local hour, export rates
// ABOUT: Rebuilds the committed snapshot from responses made out of it, so no network access is needed

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadOctopusSnapshot } from '../../src/snapshots/octopusSchema.ts';
import {
  agileImportProducts,
  agileOnTypicalYear,
  agileWindow,
  buildSnapshot,
  checkNextPage,
  cosyLocalHours,
  currentAndPrevious,
  isoDateParts,
  latestCoveredDay,
  localDayHalfHours,
  productsAvailableAtUrl,
  rateAt,
  ratesUrl,
  serialiseOctopusSnapshot,
  tariffCode,
  ukLocal,
  type OctopusResponses,
  type Rate,
} from './build.ts';

const raw = readFileSync(new URL('../../data/snapshots/octopus-london.json', import.meta.url), 'utf8');
const snapshot = loadOctopusSnapshot(JSON.parse(raw) as unknown);

const MS_PER_HALF_HOUR = 1_800_000;
const iso = (instant: number): string => new Date(instant).toISOString().replace('.000Z', 'Z');
const rate = (from: number, to: number | null, incVat: number, excVat = incVat): Rate => ({
  value_exc_vat: excVat,
  value_inc_vat: incVat,
  valid_from: iso(from),
  valid_to: to === null ? null : iso(to),
});

/** The snapshot's Agile half-hours as API rates on their real dates in the window. */
function agileRatesFromSnapshot(): Rate[] {
  const windowStart = new Date(snapshot.agile.windowStart);
  const startMonth = windowStart.getUTCMonth();
  return snapshot.agile.halfHourlyIncVatPence.map((incVat, slot) => {
    const typical = new Date(Date.UTC(2025, 0, 1) + slot * MS_PER_HALF_HOUR);
    const year = typical.getUTCMonth() >= startMonth ? windowStart.getUTCFullYear() : windowStart.getUTCFullYear() + 1;
    const from = Date.UTC(year, typical.getUTCMonth(), typical.getUTCDate(), typical.getUTCHours(), typical.getUTCMinutes());
    return rate(from, from + MS_PER_HALF_HOUR, incVat, snapshot.agile.halfHourlyExcVatPence[slot]);
  });
}

/** One rate per local hour of the snapshot's Cosy day. */
function cosyRatesFromSnapshot(): Rate[] {
  const halfHours = localDayHalfHours(snapshot.cosy.day);
  return snapshot.cosy.unitRatesIncVatPence.map((incVat, hour) =>
    rate(halfHours[2 * hour]!, halfHours[2 * hour]! + 2 * MS_PER_HALF_HOUR, incVat, snapshot.cosy.unitRatesExcVatPence[hour]),
  );
}

function responsesFromSnapshot(): OctopusResponses {
  const { outgoing, fixedSeg } = snapshot.export;
  return {
    fetchedOn: snapshot.fetchedOn,
    requestUrls: snapshot.requestUrls,
    responsesSha256: snapshot.responsesSha256,
    agileProduct: snapshot.agile.productCode,
    window: { start: snapshot.agile.windowStart, end: snapshot.agile.windowEnd },
    agileRates: agileRatesFromSnapshot(),
    agileStanding: [rate(Date.UTC(2024, 8, 30, 23), null, snapshot.agile.standingChargeIncVatPencePerDay, snapshot.agile.standingChargeExcVatPencePerDay)],
    cosyRates: cosyRatesFromSnapshot(),
    cosyStanding: [
      rate(Date.parse(snapshot.cosy.standingChargeValidFrom), null, snapshot.cosy.standingChargeIncVatPencePerDay, snapshot.cosy.standingChargeExcVatPencePerDay),
    ],
    outgoingRates: [
      rate(Date.parse(outgoing.previousValidFrom), Date.parse(outgoing.validFrom), outgoing.previousRatePence),
      rate(Date.parse(outgoing.validFrom), null, outgoing.ratePence),
    ],
    fixedSegRates: [rate(Date.parse(fixedSeg.validFrom), null, fixedSeg.ratePence)],
  };
}

describe('buildSnapshot', () => {
  it('rebuilds the committed snapshot from equivalent responses', () => {
    expect(buildSnapshot(responsesFromSnapshot())).toEqual(snapshot);
  });

  it('writes the committed file byte for byte, each array of numbers on one line', () => {
    expect(serialiseOctopusSnapshot(snapshot)).toBe(raw);
  });

  it('refuses a Cosy day with no standing charge, or export tariffs with no current or earlier rate', () => {
    const responses = responsesFromSnapshot();
    expect(() => buildSnapshot({ ...responses, cosyStanding: [] })).toThrow(/no standing charge/);
    expect(() => buildSnapshot({ ...responses, outgoingRates: responses.outgoingRates.slice(1) })).toThrow(/no earlier rate/);
    expect(() => buildSnapshot({ ...responses, fixedSegRates: [] })).toThrow(/no rate in force/);
  });
});

describe('agileOnTypicalYear', () => {
  const window = { start: '2023-10-01T00:00:00Z', end: '2024-10-01T00:00:00Z' };
  /** A leap-year window: one rate per half-hour, equal to its index, plus one outside the window. */
  const rates = Array.from({ length: 366 * 48 + 1 }, (_, index) => {
    const from = Date.parse(window.start) + index * MS_PER_HALF_HOUR;
    return rate(from, from + MS_PER_HALF_HOUR, index - 100, index / 2);
  });

  it('places each half-hour by calendar date and time, drops 29 February and passes negative prices through', () => {
    const { incVat, excVat } = agileOnTypicalYear(rates, window);
    expect(incVat).toHaveLength(17_520);
    // 1 October 00:00 is typical-year half-hour 273 days × 48 in; the window starts there with index 0.
    expect(incVat[273 * 48]).toBe(-100);
    expect(excVat[273 * 48]).toBe(0);
    // 1 March 2024 follows 29 February, 152 days into the window (92 to the new year, 31 in January, 29 in February).
    expect(incVat[59 * 48]).toBe((92 + 31 + 29) * 48 - 100);
    expect(Math.min(...incVat)).toBeLessThan(0);
  });

  it('refuses a half-hour given twice, a missing one, or a rate that is not one half-hour long', () => {
    expect(() => agileOnTypicalYear([...rates, rates[5]!], window)).toThrow(/two rates for/);
    expect(() => agileOnTypicalYear(rates.slice(10), window)).toThrow(/no rate for 10 typical-year half-hours/);
    const long = { ...rates[0]!, valid_to: iso(Date.parse(rates[0]!.valid_from) + 2 * MS_PER_HALF_HOUR) };
    expect(() => agileOnTypicalYear([long, ...rates.slice(1)], window)).toThrow(/not one half-hour long/);
    expect(() => agileOnTypicalYear([{ ...rates[0]!, valid_to: null }, ...rates.slice(1)], window)).toThrow(/not one half-hour long/);
  });
});

describe('the Agile window and products', () => {
  it('is the 12 whole months before the month of the fetch', () => {
    expect(agileWindow('2026-10-21')).toEqual({ start: '2025-10-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' });
    expect(agileWindow('2027-01-03')).toEqual({ start: '2026-01-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' });
  });

  it('keeps only Agile import products', () => {
    const page = {
      next: null,
      results: [
        { code: 'AGILE-24-10-01', direction: 'IMPORT' },
        { code: 'AGILE-OUTGOING-19-05-13', direction: 'EXPORT' },
        { code: 'AGILE-24-10-01/../../x', direction: 'IMPORT' },
        { code: 'COSY-22-12-08', direction: 'IMPORT' },
      ],
    };
    expect(agileImportProducts(page)).toEqual(['AGILE-24-10-01']);
  });

  it('follows next page links only on Octopus’s own host', () => {
    const next = 'https://api.octopus.energy/v1/products/A/electricity-tariffs/E-1R-A-C/standard-unit-rates/?page=2';
    expect(checkNextPage(next)).toBe(next);
    expect(() => checkNextPage('https://example.com/v1/products/?page=2')).toThrow(/points away from/);
  });

  it('builds the London request URLs', () => {
    expect(tariffCode('COSY-22-12-08')).toBe('E-1R-COSY-22-12-08-C');
    expect(ratesUrl('COSY-22-12-08', 'standing-charges')).toBe(
      'https://api.octopus.energy/v1/products/COSY-22-12-08/electricity-tariffs/E-1R-COSY-22-12-08-C/standing-charges/?page_size=1500',
    );
    expect(ratesUrl('A', 'standard-unit-rates', { from: 'x', to: 'y' })).toContain('period_from=x&period_to=y');
    expect(productsAvailableAtUrl('2025-10-01T00:00Z')).toContain('available_at=2025-10-01T00%3A00Z');
  });
});

describe('UK local time and Cosy', () => {
  it('gives the UK local date and minute of an instant, in winter and summer', () => {
    expect(ukLocal(Date.UTC(2026, 0, 15, 23, 30))).toEqual({ day: '2026-01-15', minute: 23 * 60 + 30 });
    expect(ukLocal(Date.UTC(2026, 6, 15, 23, 30))).toEqual({ day: '2026-07-16', minute: 30 });
  });

  it('lists 48 local half-hours on an ordinary day and refuses a clock-change day', () => {
    expect(localDayHalfHours('2026-07-16')[0]).toBe(Date.UTC(2026, 6, 15, 23));
    expect(() => localDayHalfHours('2026-03-29')).toThrow(/46 local half-hours/);
    expect(() => localDayHalfHours('2026-10-25')).toThrow(/50 local half-hours/);
  });

  it('reads Cosy’s rates by local hour and refuses a rate that changes within an hour or a gap', () => {
    const rates = cosyRatesFromSnapshot();
    expect(cosyLocalHours(rates, snapshot.cosy.day).incVat).toEqual(snapshot.cosy.unitRatesIncVatPence);
    const from = Date.parse(rates[3]!.valid_from);
    const split = [...rates.slice(0, 3), rate(from, from + MS_PER_HALF_HOUR, 1), rate(from + MS_PER_HALF_HOUR, from + 2 * MS_PER_HALF_HOUR, 2), ...rates.slice(4)];
    expect(() => cosyLocalHours(split, snapshot.cosy.day)).toThrow(/changes within local hour 3/);
    expect(() => cosyLocalHours(rates.slice(1), snapshot.cosy.day)).toThrow(/no rate at/);
  });

  it('picks the latest fully covered day without a clock change', () => {
    const rates = cosyRatesFromSnapshot();
    expect(latestCoveredDay(rates)).toBe(snapshot.cosy.day);
    expect(() => latestCoveredDay(rates.slice(1))).toThrow(/No local day is fully covered/);
    const clockChange = localDayHalfHours('2026-10-24').map((instant) => rate(instant, instant + MS_PER_HALF_HOUR, 1));
    const changeDay = Array.from({ length: 50 }, (_, index) => {
      const from = Date.UTC(2026, 9, 24, 23) + index * MS_PER_HALF_HOUR;
      return rate(from, from + MS_PER_HALF_HOUR, 1);
    });
    expect(latestCoveredDay([...clockChange, ...changeDay])).toBe('2026-10-24');
  });

  it('finds the rate in force at an instant, with an open end running on', () => {
    const rates = [rate(0, 10, 1), rate(10, null, 2)];
    expect([rateAt(rates, 5)?.value_inc_vat, rateAt(rates, 1e12)?.value_inc_vat, rateAt(rates, -1)]).toEqual([1, 2, undefined]);
  });
});

describe('small helpers', () => {
  it('orders flat tariff rates newest first', () => {
    const { current, previous } = currentAndPrevious([rate(0, 10, 1), rate(10, null, 2)], 'Test');
    expect([current.value_inc_vat, previous?.value_inc_vat]).toEqual([2, 1]);
    expect(() => currentAndPrevious([rate(0, 10, 1)], 'Test')).toThrow(/Test has no rate in force/);
  });

  it('reads the numbers of an ISO date', () => {
    expect(isoDateParts('2026-10-21')).toEqual({ year: 2026, month: 10, date: 21 });
    expect(() => isoDateParts('21/10/2026')).toThrow(/YYYY-MM-DD/);
  });
});
