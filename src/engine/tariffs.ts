// ABOUT: Electricity tariffs as hourly unit rates on engine hours: the price cap (flat), Octopus Cosy and Octopus Agile
// ABOUT: Marks each tariff's cheap and peak hours, which the control rules act on; the price cap has neither

import type { OctopusSnapshot } from '../snapshots/octopusSchema.ts';
import { expandDaily, hourlyFromHalfHourly, REFERENCE_CALENDAR, type Calendar } from './calendar.ts';
import { HOURS_PER_DAY, HOURS_PER_YEAR } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

export const TARIFFS = ['cap', 'cosy', 'agile'] as const;
export type Tariff = (typeof TARIFFS)[number];
export type TimeOfUseTariff = Exclude<Tariff, 'cap'>;

/** The band of an hour the control rules act on. Hours in neither band are 0. */
export const CHEAP = 1;
export const PEAK = -1;

export interface ElectricityTariff {
  readonly tariff: Tariff;
  /** The unit rate in each engine hour, with VAT, p/kWh. Agile's may be negative. */
  readonly unitRatePence: Float64Array;
  readonly standingChargePencePerDay: number;
  /** CHEAP, PEAK or 0 in each engine hour. */
  readonly band: Int8Array;
  /** False when no hour is cheap or peak, so control can change nothing. */
  readonly hasBands: boolean;
}

/**
 * Agile's past 12 months from the Octopus snapshot, before VAT, as hourly means on engine hours. Loaded once: the
 * rates hold no uncertain values. Each run applies its inputs' VAT and standing charge.
 */
export interface AgileRates {
  readonly hourlyExcVatPence: Float64Array;
  /** The past 12 months the rates come from: start inclusive, end exclusive, UTC. */
  readonly window: { readonly start: string; readonly end: string };
  /** The daily cheap and peak bands for each share, computed once. VAT never changes their order. */
  readonly bandsByShare: Map<number, Int8Array>;
}

/** Each UTC hour's Agile rate is the mean of its two half-hours, before VAT. */
export function agileFromSnapshot(snapshot: OctopusSnapshot): AgileRates {
  return {
    hourlyExcVatPence: hourlyFromHalfHourly(snapshot.agile.halfHourlyExcVatPence),
    window: { start: snapshot.agile.windowStart, end: snapshot.agile.windowEnd },
    bandsByShare: new Map(),
  };
}

const hasAnyBand = (band: Int8Array): boolean => band.some((value) => value !== 0);

/** The price cap for the inputs: one rate in every hour, and no cheap or peak hours. */
export function capTariff(inputs: Pick<EngineInputs, 'electricityUnitRatePence' | 'electricityStandingChargePencePerDay'>): ElectricityTariff {
  return {
    tariff: 'cap',
    unitRatePence: new Float64Array(HOURS_PER_YEAR).fill(inputs.electricityUnitRatePence),
    standingChargePencePerDay: inputs.electricityStandingChargePencePerDay,
    band: new Int8Array(HOURS_PER_YEAR),
    hasBands: false,
  };
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

/** Cosy for the inputs: its rates by local hour (with VAT), cheap at the lowest and peak at the highest. */
export function cosyTariff(
  inputs: Pick<EngineInputs, 'cosyUnitRatePence' | 'cosyStandingChargePencePerDay'>,
  calendar: Calendar = REFERENCE_CALENDAR,
): ElectricityTariff {
  const rates = inputs.cosyUnitRatePence;
  if (rates.length !== HOURS_PER_DAY) throw new Error(`The Cosy unit rate profile needs ${HOURS_PER_DAY} values, got ${rates.length}`);
  const band = profileBands(rates, calendar);
  return { tariff: 'cosy', unitRatePence: expandDaily(rates, calendar), standingChargePencePerDay: inputs.cosyStandingChargePencePerDay, band, hasBands: hasAnyBand(band) };
}

/** Agile for the inputs: the past year's hourly rates with today's VAT, and each local day's cheapest and dearest share. */
export function agileTariff(
  inputs: Pick<EngineInputs, 'electricityVatRate' | 'agileStandingChargePencePerDay' | 'agileCheapPeakShare'>,
  agile: AgileRates,
  calendar: Calendar = REFERENCE_CALENDAR,
): ElectricityTariff {
  let band = agile.bandsByShare.get(inputs.agileCheapPeakShare);
  if (!band) {
    band = dailyShareBands(agile.hourlyExcVatPence, calendar, inputs.agileCheapPeakShare);
    agile.bandsByShare.set(inputs.agileCheapPeakShare, band);
  }
  const vatFactor = 1 + inputs.electricityVatRate;
  return {
    tariff: 'agile',
    unitRatePence: agile.hourlyExcVatPence.map((rate) => rate * vatFactor),
    standingChargePencePerDay: inputs.agileStandingChargePencePerDay,
    band,
    hasBands: hasAnyBand(band),
  };
}

/** The unit cost of a year's imports in pence: each hour's import at that hour's rate. */
export function importUnitPence(importKwh: Float64Array, tariff: ElectricityTariff): number {
  let pence = 0;
  for (let hour = 0; hour < importKwh.length; hour += 1) pence += importKwh[hour]! * tariff.unitRatePence[hour]!;
  return pence;
}
