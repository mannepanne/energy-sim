// ABOUT: Checks payback against the hand-worked examples in REFERENCE/engine.md: normal payback, year 0, cheaper up front
// ABOUT: but dearer to run, "doesn't pay back" and a reference boiler replacement; plus the grant, horizons and summaries

import { describe, expect, it } from 'vitest';
import {
  CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN,
  components,
  DOES_NOT_PAY_BACK,
  horizonAgainstReference,
  paybackQuantile,
  paybackYear,
  replacementPounds,
  runningCostInYear,
  samplePayback,
  solarHorizon,
  summarisePayback,
  upfrontPounds,
  wholeYears,
  type CapitalCosts,
  type Component,
  type PaybackSide,
  type PriceScenario,
} from './payback.ts';

const NO_CHANGE: PriceScenario = { gasChangePerYear: 0, electricityChangePerYear: 0 };

const boiler = (lifetimeYears: number): Component => ({ name: 'boiler', installPounds: 3_000, replacementPounds: 3_000, lifetimeYears });
const heatPump = (installPounds: number): Component => ({ name: 'heatPump', installPounds, replacementPounds: installPounds + 7_500, lifetimeYears: 15 });

/** The reference in the examples: a £3,000 boiler, £800 of gas and £400 of electricity a year. */
const reference = (boilerLifetimeYears: number): PaybackSide => ({ kit: [boiler(boilerLifetimeYears)], running: { gasPounds: 800, electricityPounds: 400 } });
const heatPumpSide = (installPounds: number, electricityPounds: number): PaybackSide => ({ kit: [heatPump(installPounds)], running: { gasPounds: 0, electricityPounds } });

describe('the hand-worked payback examples (REFERENCE/engine.md)', () => {
  it('example 1, normal payback: £1,500 extra, saving £200 rising with gas at 5% a year, pays back in year 6', () => {
    const scenario = { gasChangePerYear: 0.05, electricityChangePerYear: 0 };
    const savings = [1, 2, 3, 4, 5, 6].map((year) => runningCostInYear(reference(10).running, scenario, year) - 1_000);
    expect(savings.map((saving) => Math.round(saving * 100) / 100)).toEqual([200, 240, 282, 326.1, 372.41, 421.03]);
    expect(paybackYear(heatPumpSide(4_500, 1_000), reference(10), 15, scenario)).toBe(6);
  });

  it('example 2, a reference boiler replacement inside the horizon: saving £100 a year, year 15 becomes year 10', () => {
    const option = heatPumpSide(4_500, 1_100);
    // With a boiler that outlasts the horizon, £1,500 at £100 a year takes 15 years.
    expect(paybackYear(option, reference(20), 15, NO_CHANGE)).toBe(15);
    // A 10-year boiler is replaced at the end of year 10: −1,500 + 10 × 100 + 3,000 = 2,500.
    expect(paybackYear(option, reference(10), 15, NO_CHANGE)).toBe(10);
  });

  it('example 3, year 0: a heat pump costing less up front after the grant, and no more to run', () => {
    expect(paybackYear(heatPumpSide(1_500, 1_100), reference(10), 15, NO_CHANGE)).toBe(0);
    expect(paybackYear(heatPumpSide(1_500, 1_200), reference(10), 15, NO_CHANGE)).toBe(0);
  });

  it('example 3b, cheaper up front but costs more to run: no payback year', () => {
    expect(paybackYear(heatPumpSide(1_500, 1_300), reference(10), 15, NO_CHANGE)).toBe(CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN);
    // £100 a year cheaper to run at first, but electricity rises 2% a year against flat gas. The cumulative saving
    // peaks at £396 in year 7, is still £18.24 after year 14, and falls to −£105.39 in year 15.
    const rising = { gasChangePerYear: 0, electricityChangePerYear: 0.02 };
    const saving = (year: number): number => runningCostInYear(reference(10).running, rising, year) - runningCostInYear({ gasPounds: 0, electricityPounds: 1_100 }, rising, year);
    const cumulative = (years: number): number => Array.from({ length: years }, (_, index) => saving(index + 1)).reduce((total, value) => total + value, 0);
    expect(cumulative(14)).toBeCloseTo(18.24, 2);
    expect(cumulative(15)).toBeCloseTo(-105.39, 2);
    expect(paybackYear(heatPumpSide(1_500, 1_100), reference(10), 14, rising)).toBe(0);
    expect(paybackYear(heatPumpSide(1_500, 1_100), reference(10), 15, rising)).toBe(CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN);
  });

  it('example 4, doesn’t pay back: costing £100 a year more to run, with the boiler’s lifetime ending at the horizon', () => {
    expect(paybackYear(heatPumpSide(4_500, 1_300), reference(15), 15, NO_CHANGE)).toBe(DOES_NOT_PAY_BACK);
    // A 10-year boiler would be replaced inside the horizon, and that alone recovers the cost: −1,500 − 1,000 + 3,000.
    expect(paybackYear(heatPumpSide(4_500, 1_300), reference(10), 15, NO_CHANGE)).toBe(10);
  });

  it('example 5, the summary: years 6, 10 and 0, two that don’t pay back and one cheaper up front that costs more to run', () => {
    const years = [6, 10, 0, DOES_NOT_PAY_BACK, CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, DOES_NOT_PAY_BACK];
    const summary = summarisePayback(years, 6);
    expect(summary.sharePaysBack).toBe(0.5);
    expect(summary.shareDoesNotPayBack).toBeCloseTo(1 / 3, 12);
    expect(summary.shareCheaperUpFrontCostsMoreToRun).toBeCloseTo(1 / 6, 12);
    expect(summary.median).toBe(10);
    expect(summary.p10).toBeCloseTo(2.4, 12);
    expect(summary.p90).toBe(DOES_NOT_PAY_BACK);
    expect(summary.central).toBe(6);
  });
});

describe('replacements', () => {
  it('replaces a component each time its lifetime ends strictly inside the horizon', () => {
    const kit = [boiler(5)];
    expect([1, 4, 5, 6, 10, 14, 15].map((year) => replacementPounds(kit, year, 15))).toEqual([0, 0, 3_000, 0, 3_000, 0, 0]);
  });

  it('takes the first crossing: a later replacement that sets the position back does not undo it', () => {
    // £1,500 extra, saving £100 a year; the reference's boiler is replaced at year 5, so the position is £2,000.
    // A replacement on the option side costing £3,000 at year 6 then takes it to −£900.
    const option: PaybackSide = { kit: [heatPump(4_500), { name: 'pv', installPounds: 0, replacementPounds: 3_000, lifetimeYears: 6 }], running: { gasPounds: 0, electricityPounds: 1_100 } };
    expect(-1_500 + 5 * 100 + 3_000).toBe(2_000);
    expect(2_000 + 100 - replacementPounds(option.kit, 6, 15)).toBe(-900);
    expect(paybackYear(option, reference(5), 15, NO_CHANGE)).toBe(5);
  });

  it('counts the option’s own replacements against it', () => {
    // Both sides replace the same boiler at year 5, so it cancels and £150 a year takes 10 years.
    const option: PaybackSide = { kit: [boiler(5), { name: 'pv', installPounds: 1_500, replacementPounds: 1_500, lifetimeYears: 30 }], running: { gasPounds: 800, electricityPounds: 250 } };
    expect(paybackYear(option, reference(5), 20, NO_CHANGE)).toBe(10);
    // A PV system lasting 6 years is replaced at year 6, setting the position back by £1,500.
    const shortLived: PaybackSide = { ...option, kit: [boiler(5), { name: 'pv', installPounds: 1_500, replacementPounds: 1_500, lifetimeYears: 6 }] };
    expect(paybackYear(shortLived, reference(5), 20, NO_CHANGE)).toBe(DOES_NOT_PAY_BACK);
  });

  it('rejects a horizon that is not a whole number of years', () => {
    expect(() => paybackYear(heatPumpSide(4_500, 1_000), reference(10), 0, NO_CHANGE)).toThrow(/whole number of years/);
    expect(() => paybackYear(heatPumpSide(4_500, 1_000), reference(10), 12.5, NO_CHANGE)).toThrow(/whole number of years/);
  });
});

describe('the running cost under the price scenario', () => {
  it('uses today’s prices in year 1 and grows each fuel’s part by its own change', () => {
    const cost = { gasPounds: 1_000, electricityPounds: 500 };
    const scenario = { gasChangePerYear: 0.1, electricityChangePerYear: -0.1 };
    expect(runningCostInYear(cost, scenario, 1)).toBe(1_500);
    expect(runningCostInYear(cost, scenario, 3)).toBeCloseTo(1_000 * 1.21 + 500 * 0.81, 9);
  });
});

const CAPITAL: CapitalCosts = {
  boilerPounds: 3_000,
  heatPumpPounds: 12_000,
  pvPoundsPerKwp: 1_500,
  grantPounds: 7_500,
  boilerLifetimeYears: 12.6,
  heatPumpLifetimeYears: 17.4,
  pvLifetimeYears: 25.5,
};

describe('each setup’s kit and the grant', () => {
  it('applies the grant to heat pump setups only, and never to a replacement heat pump', () => {
    const economics = { capital: CAPITAL, pvPeakPowerKw: 4 };
    expect(upfrontPounds(components('gas', economics))).toBe(3_000);
    expect(upfrontPounds(components('gasSolar', economics))).toBe(3_000 + 6_000);
    expect(upfrontPounds(components('heatPump', economics))).toBe(4_500);
    expect(upfrontPounds(components('heatPumpSolar', economics))).toBe(4_500 + 6_000);
    expect(components('heatPump', economics)[0]!.replacementPounds).toBe(12_000);
  });

  it('caps the grant at the heat pump’s cost', () => {
    expect(upfrontPounds(components('heatPump', { capital: { ...CAPITAL, heatPumpPounds: 6_000 }, pvPeakPowerKw: 4 }))).toBe(0);
  });

  it('rounds lifetimes to whole years, at least one', () => {
    expect(components('gas', { capital: CAPITAL, pvPeakPowerKw: 0 })[0]!.lifetimeYears).toBe(13);
    expect([wholeYears(0.2), wholeYears(17.5), wholeYears(17.4)]).toEqual([1, 18, 17]);
  });
});

describe('horizons', () => {
  it('uses the heat pump’s lifetime for heat pump setups, with or without solar, and PV’s for gas with solar', () => {
    expect(horizonAgainstReference('heatPump', CAPITAL)).toBe(17);
    expect(horizonAgainstReference('heatPumpSolar', CAPITAL)).toBe(17);
    expect(horizonAgainstReference('gasSolar', CAPITAL)).toBe(26);
    expect(solarHorizon(CAPITAL)).toBe(26);
    expect(() => horizonAgainstReference('gas', CAPITAL)).toThrow(/is the reference/);
  });

  it('works out a sample’s payback from its economics and the running costs by setup', () => {
    const economics = { capital: CAPITAL, priceScenario: NO_CHANGE, pvPeakPowerKw: 4 };
    // Solar on gas: £6,000 extra, saving £400 of electricity a year, over 26 years: year 15.
    const running = { gas: { gasPounds: 800, electricityPounds: 400 }, gasSolar: { gasPounds: 800, electricityPounds: 0 } };
    expect(samplePayback('gasSolar', 'gas', 26, economics, running)).toBe(15);
    expect(() => samplePayback('heatPump', 'gas', 17, economics, running)).toThrow(/"heatPump" is not in this run/);
  });
});

describe('payback quantiles', () => {
  it('interpolates between years that pay back, as quantile does', () => {
    expect(paybackQuantile([4, 1, 3, 2, 5], 0.1)).toBeCloseTo(1.4, 12);
    expect(paybackQuantile([7], 0.9)).toBe(7);
  });

  it('is "beyond lifetime" when either neighbour doesn’t pay back, including when none does', () => {
    expect(paybackQuantile([1, DOES_NOT_PAY_BACK], 0.5)).toBe(DOES_NOT_PAY_BACK);
    expect(paybackQuantile([DOES_NOT_PAY_BACK, DOES_NOT_PAY_BACK], 0.5)).toBe(DOES_NOT_PAY_BACK);
    expect(paybackQuantile([1, 2, DOES_NOT_PAY_BACK], 0)).toBe(1);
    expect(summarisePayback([DOES_NOT_PAY_BACK, DOES_NOT_PAY_BACK], DOES_NOT_PAY_BACK).sharePaysBack).toBe(0);
  });

  it('refuses a sample with no payback year, which summaries leave out first', () => {
    expect(() => paybackQuantile([CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, 3], 0.5)).toThrow(/years 0 or more/);
    const allCheaper = summarisePayback([CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN], CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN);
    expect(allCheaper.shareCheaperUpFrontCostsMoreToRun).toBe(1);
    expect([allCheaper.p10, allCheaper.median, allCheaper.p90]).toEqual([-1, -1, -1]);
  });

  it('rejects no values or a quantile outside 0–1', () => {
    expect(() => paybackQuantile([], 0.5)).toThrow(/no values/);
    expect(() => paybackQuantile([1], -0.1)).toThrow(/between 0 and 1/);
    expect(() => summarisePayback([], 0)).toThrow(/zero samples/);
  });
});
