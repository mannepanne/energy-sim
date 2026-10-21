// ABOUT: Tests for the electricity tariffs: the flat cap, Cosy's fixed local-time periods, Agile's daily cheapest and
// ABOUT: dearest quarters, VAT and half-hour averaging, and the register rows that must match the Octopus snapshot

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { loadOctopusSnapshot } from '../snapshots/octopusSchema.ts';
import { buildCalendar } from './calendar.ts';
import { HOURS_PER_YEAR } from './constants.ts';
import { capTariff, CHEAP, dailyShareBands, importUnitPence, PEAK, profileBands, readTimeOfUseTariffs, REFERENCE_CALENDAR } from './tariffs.ts';
import { FIXTURE_COSY_RATES, fixtureAccessor } from './testing/fixtureRegister.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const snapshot = loadOctopusSnapshot(readJson('../../data/snapshots/octopus-london.json'));
const calendar = buildCalendar();
const { summerTime } = calendar;

/** The UTC hour of the day of the first cheap hour from 00:00 UTC on a day. */
function firstCheapHour(bands: Int8Array, day: number): number {
  return (bands.indexOf(CHEAP, day * 24) - day * 24) % 24;
}

describe('the price cap', () => {
  it('has one rate in every hour and no cheap or peak hours, and is built once per rate', () => {
    const cap = capTariff(25, 50);
    expect(cap.unitRatePence.every((rate) => rate === 25)).toBe(true);
    expect(cap.band.every((value) => value === 0)).toBe(true);
    expect(cap.hasBands).toBe(false);
    expect(capTariff(25, 50)).toBe(cap);
    expect(capTariff(26, 50)).not.toBe(cap);
  });
});

describe('profileBands', () => {
  const bands = profileBands(FIXTURE_COSY_RATES, calendar);

  it('marks the lowest rate cheap and the highest peak, by local hour', () => {
    // 3 January is in winter time, so engine hour = local hour.
    const day = 2 * 24;
    expect(Array.from(bands.slice(day + 3, day + 8))).toEqual([0, CHEAP, CHEAP, CHEAP, 0]);
    expect(Array.from(bands.slice(day + 15, day + 20))).toEqual([0, PEAK, PEAK, PEAK, 0]);
  });

  it('keeps the periods fixed in local time, so in summer they start one UTC hour earlier', () => {
    const summerDay = 180 * 24;
    expect(summerDay).toBeGreaterThan(summerTime.startHour);
    expect(Array.from(bands.slice(summerDay + 2, summerDay + 7))).toEqual([0, CHEAP, CHEAP, CHEAP, 0]);
  });

  it('moves by one UTC hour exactly at the clock changes', () => {
    // Each clock change is at 01:00 UTC on a Sunday: check the day before and the day after.
    const [startDay, endDay] = [Math.floor(summerTime.startHour / 24), Math.floor(summerTime.endHour / 24)];
    expect([firstCheapHour(bands, startDay - 1), firstCheapHour(bands, startDay + 1)]).toEqual([4, 3]);
    expect([firstCheapHour(bands, endDay - 1), firstCheapHour(bands, endDay + 1)]).toEqual([3, 4]);
  });

  it('marks nothing on a flat profile', () => {
    expect(profileBands(Array.from({ length: 24 }, () => 20), calendar).every((value) => value === 0)).toBe(true);
  });
});

describe('dailyShareBands', () => {
  // Rates that rise through each local day, so the cheapest hours are the first and the dearest the last.
  const rising = Float64Array.from({ length: HOURS_PER_YEAR }, (_, hour) => calendar.localHourOfDay[hour]!);
  const bands = dailyShareBands(rising, calendar, 0.25);

  it('marks a quarter of each local day cheap and a quarter peak: 6 hours, also on the 23- and 25-hour days', () => {
    const counts = new Map<number, { cheap: number; peak: number }>();
    bands.forEach((value, hour) => {
      const day = calendar.localDayOfYear[hour]!;
      const count = counts.get(day) ?? { cheap: 0, peak: 0 };
      if (value === CHEAP) count.cheap += 1;
      if (value === PEAK) count.peak += 1;
      counts.set(day, count);
    });
    expect(counts.size).toBe(365);
    for (const count of counts.values()) expect(count).toEqual({ cheap: 6, peak: 6 });
  });

  it('picks the cheapest and dearest hours of the local day', () => {
    const day = 10 * 24;
    expect(Array.from(bands.slice(day, day + 24))).toEqual([...Array.from({ length: 6 }, () => CHEAP), ...Array.from({ length: 12 }, () => 0), ...Array.from({ length: 6 }, () => PEAK)]);
  });

  it('breaks ties by the earlier hour', () => {
    const flat = dailyShareBands(new Float64Array(HOURS_PER_YEAR), calendar, 0.25);
    expect(Array.from(flat.slice(0, 24))).toEqual([...Array.from({ length: 6 }, () => PEAK), ...Array.from({ length: 18 }, () => 0)]);
  });

  it('rejects a share outside (0, 0.5] or rates of the wrong length', () => {
    expect(() => dailyShareBands(rising, calendar, 0)).toThrow(/above 0 and at most 0.5/);
    expect(() => dailyShareBands(rising, calendar, 0.6)).toThrow(/above 0 and at most 0.5/);
    expect(() => dailyShareBands(new Float64Array(10), calendar, 0.25)).toThrow(/8760 hours/);
  });
});

describe('readTimeOfUseTariffs', () => {
  const access = fixtureAccessor();
  const tariffs = readTimeOfUseTariffs(access, snapshot);

  it('reads Cosy from the register: rates and bands by local hour, and its standing charge', () => {
    expect(tariffs.cosy.unitRatePence[2 * 24 + 5]).toBe(10);
    expect(tariffs.cosy.unitRatePence[2 * 24 + 17]).toBe(40);
    expect(tariffs.cosy.standingChargePencePerDay).toBe(40);
    expect(tariffs.cosy.hasBands).toBe(true);
  });

  it('averages each UTC hour’s two Agile half-hours, before VAT with today’s VAT applied', () => {
    const half = snapshot.agile.halfHourlyExcVatPence;
    for (const hour of [0, 1_000, 5_000, HOURS_PER_YEAR - 1]) expect(tariffs.agile.unitRatePence[hour]).toBeCloseTo((half[2 * hour]! + half[2 * hour + 1]!) / 2, 12);
    const withVat = readTimeOfUseTariffs(fixtureAccessor({ 'prices.electricityVatRate': 0.05 }), snapshot);
    expect(withVat.agile.unitRatePence[1_000]).toBeCloseTo(tariffs.agile.unitRatePence[1_000]! * 1.05, 12);
    expect(() => readTimeOfUseTariffs(fixtureAccessor({ 'prices.electricityVatRate': -0.1 }), snapshot)).toThrow(/must not be negative/);
  });

  it('passes negative Agile prices through', () => {
    expect(Math.min(...tariffs.agile.unitRatePence)).toBeLessThan(0);
  });

  it('marks Agile’s cheapest and dearest quarter of each day, and records the window', () => {
    expect(tariffs.agile.band.filter((value) => value === CHEAP)).toHaveLength(365 * 6);
    expect(tariffs.agile.standingChargePencePerDay).toBe(35);
    expect(tariffs.agileWindow).toEqual({ start: snapshot.agile.windowStart, end: snapshot.agile.windowEnd });
  });

  it('uses the reference calendar by default', () => {
    expect(REFERENCE_CALENDAR.summerTime).toEqual(calendar.summerTime);
  });

  it('rejects a Cosy profile that is not 24 hours', () => {
    const register = loadRegister(readJson('../../data/register.json'));
    const broken = createAccessor({ rows: register.rows.map((row) => (row.id === 'tariffs.cosyUnitRate' && row.kind === 'profile' ? { ...row, values: row.values.slice(0, 12), resolution: 'month' as const } : row)) });
    expect(() => readTimeOfUseTariffs(broken, snapshot)).toThrow(/Cosy unit rate profile needs 24 values/);
  });
});

describe('importUnitPence', () => {
  it('prices each hour’s import at that hour’s rate, so a negative rate pays the house', () => {
    const tariff = { ...capTariff(10, 0), unitRatePence: Float64Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour === 0 ? -5 : 10)) };
    const importKwh = Float64Array.from({ length: HOURS_PER_YEAR }, (_, hour) => (hour < 2 ? 2 : 0));
    expect(importUnitPence(importKwh, tariff)).toBe(-10 + 20);
  });
});

describe('the register and the Octopus snapshot', () => {
  const access = createAccessor(loadRegister(readJson('../../data/register.json')));

  it('holds Cosy’s rates and both standing charges as the snapshot gives them', () => {
    expect(access.profile('tariffs.cosyUnitRate').values).toEqual(snapshot.cosy.unitRatesIncVatPence);
    expect(access.fixed('tariffs.cosyStandingCharge').value).toBe(snapshot.cosy.standingChargeIncVatPencePerDay);
    expect(access.fixed('tariffs.agileStandingCharge').value).toBe(snapshot.agile.standingChargeIncVatPencePerDay);
  });

  it('spans the export row from the fixed export tariff to Outgoing Octopus’s previous rate, with today’s as the mode', () => {
    const exportRate = access.uncertain('prices.exportRate');
    expect([exportRate.low, exportRate.default, exportRate.high]).toEqual([
      snapshot.export.fixedSeg.ratePence,
      snapshot.export.outgoing.ratePence,
      snapshot.export.outgoing.previousRatePence,
    ]);
  });

  it('carries no VAT on today’s Cosy rates, matching the VAT row', () => {
    expect(access.fixed('prices.electricityVatRate').value).toBe(0);
    expect(snapshot.cosy.unitRatesIncVatPence).toEqual(snapshot.cosy.unitRatesExcVatPence);
  });

  it('gives Cosy 8 cheap and 3 peak hours a day', () => {
    const rates = access.profile('tariffs.cosyUnitRate').values;
    expect(rates.filter((rate) => rate === Math.min(...rates))).toHaveLength(8);
    expect(rates.filter((rate) => rate === Math.max(...rates))).toHaveLength(3);
  });
});
