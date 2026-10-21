// ABOUT: Turns Octopus API responses into the committed London snapshot: Cosy by local hour, Agile on the typical year, export rates
// ABOUT: Pure functions with no network access; scripts/fetch-octopus.ts fetches the pages and calls them

import { z } from 'zod';
import { typicalYearHalfHour } from '../../src/engine/calendar.ts';
import { HALF_HOURS_PER_TYPICAL_YEAR, octopusSnapshotSchema, type OctopusSnapshot } from '../../src/snapshots/octopusSchema.ts';

export const API_ROOT = 'https://api.octopus.energy/v1';
export const REGION = 'C';
/** The API's largest page. A year of Agile half-hours takes 12 pages. */
export const PAGE_SIZE = 1500;

export const COSY_PRODUCT = 'COSY-22-12-08';
export const OUTGOING_PRODUCT = 'OUTGOING-VAR-24-10-26';
export const FIXED_SEG_PRODUCT = 'OUTGOING-SEG-FIX-12M-20-07-07';

export const OCTOPUS_ATTRIBUTION =
  'Octopus Energy public API (api.octopus.energy), region C (London), Direct Debit, single register. Unit rates and standing charges in pence, with and without VAT as the API gives them.';

/** The single-register electricity tariff code for a product in London, such as "E-1R-COSY-22-12-08-C". */
export const tariffCode = (product: string): string => `E-1R-${product}-${REGION}`;

export type RateKind = 'standard-unit-rates' | 'standing-charges';

export function ratesUrl(product: string, kind: RateKind, period?: { from: string; to: string }): string {
  const url = new URL(`${API_ROOT}/products/${product}/electricity-tariffs/${tariffCode(product)}/${kind}/`);
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (period) {
    url.searchParams.set('period_from', period.from);
    url.searchParams.set('period_to', period.to);
  }
  return url.toString();
}

export function productsAvailableAtUrl(instant: string): string {
  const url = new URL(`${API_ROOT}/products/`);
  url.searchParams.set('available_at', instant);
  url.searchParams.set('page_size', '200');
  return url.toString();
}

const rateSchema = z.object({
  value_exc_vat: z.number(),
  value_inc_vat: z.number(),
  valid_from: z.iso.datetime({ offset: true }),
  valid_to: z.iso.datetime({ offset: true }).nullable(),
});
export type Rate = z.infer<typeof rateSchema>;

export const ratePageSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  results: z.array(rateSchema),
});

export const productPageSchema = z.object({
  next: z.string().nullable(),
  results: z.array(z.object({ code: z.string(), direction: z.string() })),
});

/**
 * The Agile import products on offer at an instant. Agile Outgoing (export) and any non-import product are left out.
 * The fetch refuses a window that more than one product covers, rather than guess how to join them.
 */
export function agileImportProducts(page: unknown): string[] {
  return productPageSchema
    .parse(page)
    .results.filter((product) => product.direction === 'IMPORT' && AGILE_PRODUCT_CODE.test(product.code))
    .map((product) => product.code);
}

/** An Agile product code as Octopus writes them, such as "AGILE-24-10-01". It goes into request paths, so nothing else is accepted. */
const AGILE_PRODUCT_CODE = /^AGILE-\d{2}-\d{2}-\d{2}$/;

/** Throws unless a `next` page link points to the API it came from, so paging never leaves Octopus's host. */
export function checkNextPage(next: string): string {
  if (new URL(next).origin !== new URL(API_ROOT).origin) throw new Error(`A next page link points away from ${API_ROOT}: ${next}`);
  return next;
}

const MS_PER_HALF_HOUR = 1_800_000;

/** The numbers of a date written as YYYY-MM-DD. */
export function isoDateParts(text: string): { year: number; month: number; date: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`Expected a date as YYYY-MM-DD, got "${text}"`);
  return { year: Number(match[1]), month: Number(match[2]), date: Number(match[3]) };
}

/** The 12-month window ending at the start of the month `fetchedOn` falls in, as UTC instants. */
export function agileWindow(fetchedOn: string): { start: string; end: string } {
  const { year, month } = isoDateParts(fetchedOn);
  const end = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(Date.UTC(year - 1, month - 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export interface TypicalYearRates {
  incVat: number[];
  excVat: number[];
}

/**
 * Places each Agile half-hour of the window on the typical year by calendar date and time (UTC). 29 February is
 * dropped. Throws on a rate that is not one half-hour long, a half-hour given twice, or a typical-year half-hour
 * with no rate. Negative prices pass through.
 */
export function agileOnTypicalYear(rates: readonly Rate[], window: { start: string; end: string }): TypicalYearRates {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const incVat = Array.from({ length: HALF_HOURS_PER_TYPICAL_YEAR }, () => Number.NaN);
  const excVat = Array.from({ length: HALF_HOURS_PER_TYPICAL_YEAR }, () => Number.NaN);
  for (const rate of rates) {
    const from = Date.parse(rate.valid_from);
    if (from < start || from >= end) continue;
    if (rate.valid_to === null || Date.parse(rate.valid_to) - from !== MS_PER_HALF_HOUR) {
      throw new Error(`Agile rate from ${rate.valid_from} is not one half-hour long (to ${rate.valid_to})`);
    }
    const slot = typicalYearHalfHour(new Date(from));
    if (slot === undefined) continue;
    if (!Number.isNaN(incVat[slot]!)) throw new Error(`Agile has two rates for ${rate.valid_from}`);
    incVat[slot] = rate.value_inc_vat;
    excVat[slot] = rate.value_exc_vat;
  }
  const missing = incVat.findIndex((value) => Number.isNaN(value));
  if (missing !== -1) {
    const missingCount = incVat.filter((value) => Number.isNaN(value)).length;
    throw new Error(`Agile has no rate for ${missingCount} typical-year half-hours, the first being half-hour ${missing} (UTC from 1 January)`);
  }
  return { incVat, excVat };
}

const londonClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** An instant as UK local date ("YYYY-MM-DD") and minutes past local midnight. */
export function ukLocal(instant: number): { day: string; minute: number } {
  const parts = Object.fromEntries(londonClock.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** The rate in force at an instant, or undefined. A rate with no end runs on. */
export function rateAt(rates: readonly Rate[], instant: number): Rate | undefined {
  return rates.find((rate) => Date.parse(rate.valid_from) <= instant && (rate.valid_to === null || instant < Date.parse(rate.valid_to)));
}

const MINUTES_PER_DAY = 1440;

/**
 * The UTC instants of a UK local day's half-hours. Throws on a clock-change day, which has 46 or 50, so a Cosy
 * day is always 24 whole local hours.
 */
export function localDayHalfHours(day: string): number[] {
  const { year, month, date } = isoDateParts(day);
  // Local midnight is 00:00 or 23:00 UTC the day before; search the half-hours from 22:00 UTC the day before.
  const from = Date.UTC(year, month - 1, date) - 2 * 2 * MS_PER_HALF_HOUR;
  const instants: number[] = [];
  for (let instant = from; instant < from + 2 * MINUTES_PER_DAY * 60_000; instant += MS_PER_HALF_HOUR) {
    if (ukLocal(instant).day === day) instants.push(instant);
  }
  if (instants.length !== 48) throw new Error(`${day} has ${instants.length} local half-hours: pick a day without a clock change`);
  return instants;
}

/**
 * Cosy's unit rates by UK local hour on one local day. Cosy's periods start on the hour, so both half-hours of
 * each local hour must have the same rate.
 */
export function cosyLocalHours(rates: readonly Rate[], day: string): TypicalYearRates {
  const incVat: number[] = [];
  const excVat: number[] = [];
  const halfHours = localDayHalfHours(day);
  const rateIn = (instant: number): Rate => {
    const rate = rateAt(rates, instant);
    if (!rate) throw new Error(`Cosy has no rate at ${new Date(instant).toISOString()} on ${day}`);
    return rate;
  };
  for (let hour = 0; hour < 24; hour += 1) {
    const first = rateIn(halfHours[2 * hour]!);
    const second = rateIn(halfHours[2 * hour + 1]!);
    if (first.value_inc_vat !== second.value_inc_vat) throw new Error(`Cosy's rate changes within local hour ${hour} on ${day}`);
    incVat.push(first.value_inc_vat);
    excVat.push(first.value_exc_vat);
  }
  return { incVat, excVat };
}

/** The latest UK local day without a clock change whose every half-hour the rates cover. */
export function latestCoveredDay(rates: readonly Rate[]): string {
  const days = [...new Set(rates.map((rate) => ukLocal(Date.parse(rate.valid_from)).day))].toSorted().toReversed();
  for (const day of days) {
    let halfHours: number[];
    try {
      halfHours = localDayHalfHours(day);
    } catch {
      continue;
    }
    if (halfHours.every((halfHour) => rateAt(rates, halfHour) !== undefined)) return day;
  }
  throw new Error('No local day is fully covered by the Cosy rates');
}

/** The current and previous rates of a flat tariff, from the API's newest-first list. */
export function currentAndPrevious(rates: readonly Rate[], what: string): { current: Rate; previous: Rate | undefined } {
  const ordered = rates.toSorted((a, b) => Date.parse(b.valid_from) - Date.parse(a.valid_from));
  const current = ordered[0];
  if (!current || current.valid_to !== null) throw new Error(`${what} has no rate in force with no end date`);
  return { current, previous: ordered[1] };
}

export interface OctopusResponses {
  fetchedOn: string;
  requestUrls: string[];
  responsesSha256: string;
  agileProduct: string;
  window: { start: string; end: string };
  agileRates: Rate[];
  agileStanding: Rate[];
  cosyRates: Rate[];
  cosyStanding: Rate[];
  outgoingRates: Rate[];
  fixedSegRates: Rate[];
}

/** Builds and validates the snapshot from the fetched rates. */
export function buildSnapshot(responses: OctopusResponses): OctopusSnapshot {
  const day = latestCoveredDay(responses.cosyRates);
  const cosy = cosyLocalHours(responses.cosyRates, day);
  const dayStart = localDayHalfHours(day)[0]!;
  const cosyStanding = rateAt(responses.cosyStanding, dayStart);
  if (!cosyStanding) throw new Error(`Cosy has no standing charge on ${day}`);
  const agile = agileOnTypicalYear(responses.agileRates, responses.window);
  const agileStanding = currentAndPrevious(responses.agileStanding, 'Agile standing charge').current;
  const outgoing = currentAndPrevious(responses.outgoingRates, 'Outgoing Octopus');
  if (!outgoing.previous) throw new Error('Outgoing Octopus has no earlier rate');
  const fixedSeg = currentAndPrevious(responses.fixedSegRates, 'The fixed Smart Export Guarantee').current;
  return octopusSnapshotSchema.parse({
    schema: 'octopus-london',
    attribution: OCTOPUS_ATTRIBUTION,
    region: REGION,
    fetchedOn: responses.fetchedOn,
    requestUrls: responses.requestUrls,
    responsesSha256: responses.responsesSha256,
    cosy: {
      productCode: COSY_PRODUCT,
      tariffCode: tariffCode(COSY_PRODUCT),
      day,
      unitRatesIncVatPence: cosy.incVat,
      unitRatesExcVatPence: cosy.excVat,
      standingChargeIncVatPencePerDay: cosyStanding.value_inc_vat,
      standingChargeExcVatPencePerDay: cosyStanding.value_exc_vat,
      standingChargeValidFrom: cosyStanding.valid_from,
    },
    agile: {
      productCode: responses.agileProduct,
      tariffCode: tariffCode(responses.agileProduct),
      windowStart: responses.window.start,
      windowEnd: responses.window.end,
      halfHourlyIncVatPence: agile.incVat,
      halfHourlyExcVatPence: agile.excVat,
      standingChargeIncVatPencePerDay: agileStanding.value_inc_vat,
      standingChargeExcVatPencePerDay: agileStanding.value_exc_vat,
    },
    export: {
      outgoing: {
        productCode: OUTGOING_PRODUCT,
        tariffCode: tariffCode(OUTGOING_PRODUCT),
        ratePence: outgoing.current.value_inc_vat,
        validFrom: outgoing.current.valid_from,
        previousRatePence: outgoing.previous.value_inc_vat,
        previousValidFrom: outgoing.previous.valid_from,
      },
      fixedSeg: {
        productCode: FIXED_SEG_PRODUCT,
        tariffCode: tariffCode(FIXED_SEG_PRODUCT),
        ratePence: fixedSeg.value_inc_vat,
        validFrom: fixedSeg.valid_from,
      },
    },
  });
}

/** Indented JSON with each array of numbers on one line, as the PVGIS snapshot is written. */
export function serialiseOctopusSnapshot(snapshot: OctopusSnapshot): string {
  const indented = JSON.stringify(snapshot, null, 2);
  return `${indented.replace(/\[\s*(-?\d[^\][{}"]*?)\s*\]/g, (_match, numbers: string) => `[${numbers.replace(/\s+/g, '')}]`)}\n`;
}
