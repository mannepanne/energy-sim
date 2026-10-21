// ABOUT: Electricity tariffs as hourly unit rates on engine hours: the price cap (flat), Octopus Cosy and Octopus Agile
// ABOUT: Marks each tariff's cheap and peak hours, which the control rules act on; the price cap has neither

import type { RegisterAccessor } from '../register/access.ts';
import type { OctopusSnapshot } from '../snapshots/octopusSchema.ts';
import { buildCalendar, expandDaily, hourlyFromHalfHourly, type Calendar } from './calendar.ts';
import { HOURS_PER_DAY, HOURS_PER_YEAR } from './constants.ts';

export const TARIFFS = ['cap', 'cosy', 'agile'] as const;
export type Tariff = (typeof TARIFFS)[number];
export type TimeOfUseTariff = Exclude<Tariff, 'cap'>;

/** The band of an hour the control rules act on. Hours in neither band are 0. */
export const CHEAP = 1;
export const PEAK = -1;

export interface ElectricityTariff {
  tariff: Tariff;
  /** The unit rate in each engine hour, p/kWh. Agile's may be negative. */
  unitRatePence: Float64Array;
  standingChargePencePerDay: number;
  /** CHEAP, PEAK or 0 in each engine hour. */
  band: Int8Array;
  /** False when no hour is cheap or peak, so control can change nothing. */
  hasBands: boolean;
}

/** Cosy and Agile, read once: they hold no uncertain values. */
export interface TimeOfUseTariffs {
  cosy: ElectricityTariff;
  agile: ElectricityTariff;
  /** The past 12 months Agile's rates come from: start inclusive, end exclusive, UTC. */
  agileWindow: { start: string; end: string };
}

/** The calendar of the reference year, which every local-time profile and tariff uses. */
export const REFERENCE_CALENDAR: Calendar = buildCalendar();

const flatTariffs = new Map<string, ElectricityTariff>();

/** The price cap: one unit rate in every hour, and no cheap or peak hours. Kept per rate, since every run uses it. */
export function capTariff(unitRatePence: number, standingChargePencePerDay: number): ElectricityTariff {
  const key = `${unitRatePence}|${standingChargePencePerDay}`;
  let tariff = flatTariffs.get(key);
  if (!tariff) {
    tariff = {
      tariff: 'cap',
      unitRatePence: new Float64Array(HOURS_PER_YEAR).fill(unitRatePence),
      standingChargePencePerDay,
      band: new Int8Array(HOURS_PER_YEAR),
      hasBands: false,
    };
    flatTariffs.set(key, tariff);
  }
  return tariff;
}

/**
 * Bands for a tariff with fixed periods by local hour of day: the hours at the lowest rate are cheap, those at the
 * highest are peak. A profile with one rate has neither.
 */
export function profileBands(ratesByLocalHour: readonly number[], calendar: Calendar): Int8Array {
  const lowest = Math.min(...ratesByLocalHour);
  const highest = Math.max(...ratesByLocalHour);
  const byHour = ratesByLocalHour.map((rate) => (lowest === highest ? 0 : rate === lowest ? CHEAP : rate === highest ? PEAK : 0));
  return Int8Array.from(expandDaily(byHour, calendar));
}

/**
 * Bands for a tariff whose rates change every day: in each UK local day, the cheapest `share` of its hours are
 * cheap and the dearest `share` are peak. The count is rounded to whole hours, so 23- and 25-hour days get the
 * same count as a 24-hour day at a quarter. Ties go to the earlier hour.
 */
export function dailyShareBands(hourlyRates: Float64Array, calendar: Calendar, share: number): Int8Array {
  if (!(share > 0 && share <= 0.5)) throw new Error(`The cheap and peak share must be above 0 and at most 0.5, got ${share}`);
  if (hourlyRates.length !== HOURS_PER_YEAR) throw new Error(`Hourly rates need ${HOURS_PER_YEAR} hours, got ${hourlyRates.length}`);
  const band = new Int8Array(HOURS_PER_YEAR);
  let dayStart = 0;
  while (dayStart < HOURS_PER_YEAR) {
    const day = calendar.localDayOfYear[dayStart]!;
    let dayEnd = dayStart;
    while (dayEnd < HOURS_PER_YEAR && calendar.localDayOfYear[dayEnd] === day) dayEnd += 1;
    const hours = Array.from({ length: dayEnd - dayStart }, (_, index) => dayStart + index);
    const count = Math.round(hours.length * share);
    const cheapestFirst = hours.toSorted((a, b) => hourlyRates[a]! - hourlyRates[b]! || a - b);
    const dearestFirst = hours.toSorted((a, b) => hourlyRates[b]! - hourlyRates[a]! || a - b);
    for (const hour of cheapestFirst.slice(0, count)) band[hour] = CHEAP;
    for (const hour of dearestFirst.slice(0, count)) band[hour] = PEAK;
    dayStart = dayEnd;
  }
  return band;
}

/** Hours of a profile per local day: 24 values, local midnight first. */
const checkDayProfile = (values: readonly number[], what: string): readonly number[] => {
  if (values.length !== HOURS_PER_DAY) throw new Error(`The ${what} needs ${HOURS_PER_DAY} values, got ${values.length}`);
  return values;
};

/**
 * Reads Cosy from the register and Agile from the Octopus snapshot. Agile's rates are its rates before VAT with
 * today's VAT applied, so every tariff carries the same VAT. Each UTC hour's Agile rate is the mean of its two
 * half-hours.
 */
export function readTimeOfUseTariffs(access: RegisterAccessor, snapshot: OctopusSnapshot, calendar: Calendar = REFERENCE_CALENDAR): TimeOfUseTariffs {
  const cosyRates = checkDayProfile(access.profile('tariffs.cosyUnitRate').values, 'Cosy unit rate profile');
  const vat = access.fixed('prices.electricityVatRate').value;
  if (!(vat >= 0)) throw new Error(`The electricity VAT rate must not be negative, got ${vat}`);
  const agileRates = hourlyFromHalfHourly(snapshot.agile.halfHourlyExcVatPence.map((rate) => rate * (1 + vat)));
  const cosy: ElectricityTariff = {
    tariff: 'cosy',
    unitRatePence: expandDaily(cosyRates, calendar),
    standingChargePencePerDay: access.fixed('tariffs.cosyStandingCharge').value,
    band: profileBands(cosyRates, calendar),
    hasBands: true,
  };
  const agile: ElectricityTariff = {
    tariff: 'agile',
    unitRatePence: agileRates,
    standingChargePencePerDay: access.fixed('tariffs.agileStandingCharge').value,
    band: dailyShareBands(agileRates, calendar, access.fixed('tariffs.agileCheapPeakShare').value),
    hasBands: true,
  };
  cosy.hasBands = cosy.band.some((value) => value !== 0);
  return { cosy, agile, agileWindow: { start: snapshot.agile.windowStart, end: snapshot.agile.windowEnd } };
}

/** The unit cost of a year's imports in pence: each hour's import at that hour's rate. */
export function importUnitPence(importKwh: Float64Array, tariff: ElectricityTariff): number {
  let pence = 0;
  for (let hour = 0; hour < importKwh.length; hour += 1) pence += importKwh[hour]! * tariff.unitRatePence[hour]!;
  return pence;
}
