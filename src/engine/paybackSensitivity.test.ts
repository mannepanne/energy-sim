// ABOUT: Checks the payback sensitivity: only capital costs, lifetimes and price changes are listed, each end's payback
// ABOUT: matches a hand-worked figure, lifetimes move the horizon, and rows are ranked by the first pair's swing

import { describe, expect, it } from 'vitest';
import { CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, DOES_NOT_PAY_BACK, type RunningCosts } from './payback.ts';
import { pairHorizon, PAYBACK_SENSITIVITY_PAIRS, paybackSensitivity, rankingYears } from './paybackSensitivity.ts';
import { CAPITAL_ROWS } from './setups.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';
import { readInputs, uncertainDraws } from './inputs.ts';
import { economicsOf } from './compare.ts';

/** £2,000 a year for the reference; the heat pump saves £300 a year, solar a further £400. */
const RUNNING: RunningCosts = {
  'gas/cap': { gasPounds: 1_500, electricityPounds: 500 },
  'gasSolar/cap': { gasPounds: 1_500, electricityPounds: 100 },
  'heatPump/cap': { gasPounds: 0, electricityPounds: 1_700 },
  'heatPumpSolar/cap': { gasPounds: 0, electricityPounds: 1_300 },
  'heatPump/cosy': { gasPounds: 0, electricityPounds: 1_500 },
  'heatPump/agile': { gasPounds: 0, electricityPounds: 2_100 },
};

// The fixture: boiler £2,000 lasting 12 years, heat pump £12,000 less the £7,500 grant lasting 18, no price changes.
const access = fixtureAccessor(
  {},
  {
    'costs.heatPumpInstalled': { low: 9_000, high: 15_000 },
    'costs.boilerInstalled': { low: 1_000, high: 4_000 },
    'costs.heatPumpLifetime': { low: 10, high: 25 },
  },
);
const heatPumpOnly = [{ option: 'heatPump/cap', against: 'gas/cap' }] as const;

describe('paybackSensitivity', () => {
  const table = paybackSensitivity(access, RUNNING);

  it('lists exactly the capital costs, lifetimes and price changes the house reads', () => {
    const capital = uncertainDraws(access).filter((draw) => CAPITAL_ROWS.has(draw.id)).map((draw) => draw.id);
    expect(table.rows.map((row) => row.id).toSorted()).toEqual(capital.toSorted());
    expect(capital.length).toBeGreaterThan(0);
    expect(table.pairs).toBe(PAYBACK_SENSITIVITY_PAIRS);
  });

  it('gives the central payback by hand: £2,500 extra at £300 a year pays back in year 9', () => {
    expect(paybackSensitivity(access, RUNNING, heatPumpOnly).central).toEqual([9]);
  });

  it('reproduces each end of the heat pump’s installed cost by hand', () => {
    const row = paybackSensitivity(access, RUNNING, heatPumpOnly).rows.find((candidate) => candidate.id === 'costs.heatPumpInstalled')!;
    // £9,000 less the grant is £500 below the boiler and it never costs more to run: year 0.
    expect(row.low.years).toEqual([0]);
    // £15,000: £5,500 extra; £3,300 saved by year 11, then the reference's boiler replacement (£2,000) in year 12.
    expect(row.high.years).toEqual([12]);
    expect(row.swingYears).toBe(12);
  });

  it('moves the horizon with the heat pump’s lifetime', () => {
    const row = table.rows.find((candidate) => candidate.id === 'costs.heatPumpLifetime')!;
    expect(row.low.horizons[0]).toBe(10);
    expect(row.high.horizons[0]).toBe(25);
    expect(row.low.years[0]).toBe(9);
  });

  it('ranks rows by the first pair’s swing, largest first, then by row id', () => {
    const swings = table.rows.map((row) => row.swingYears);
    expect(swings).toEqual(swings.toSorted((a, b) => b - a));
    expect(table.rows[0]!.id).toBe('costs.heatPumpInstalled');
    expect(table.rows[1]!.id).toBe('costs.boilerInstalled');
    const still = table.rows.filter((row) => row.swingYears === 0).map((row) => row.id);
    expect(still).toEqual(still.toSorted());
  });

  it('throws on no pairs', () => {
    expect(() => paybackSensitivity(access, RUNNING, [])).toThrow('at least one pair');
  });
});

describe('pairHorizon', () => {
  const economics = economicsOf(readInputs(access));

  it('uses the reference’s horizon against it, and PV’s lifetime for solar against no solar', () => {
    expect(pairHorizon({ option: 'heatPump/cap', against: 'gas/cap' }, economics)).toBe(18);
    expect(pairHorizon({ option: 'gasSolar/cap', against: 'gas/cap' }, economics)).toBe(25);
    expect(pairHorizon({ option: 'heatPumpSolar/cosy', against: 'heatPump/cosy' }, economics)).toBe(25);
  });

  it('throws on a pair that is neither', () => {
    expect(() => pairHorizon({ option: 'heatPump/cosy', against: 'heatPump/cap' }, economics)).toThrow('No payback horizon');
    expect(() => pairHorizon({ option: 'heatPumpSolar/cap', against: 'heatPump/cosy' }, economics)).toThrow('No payback horizon');
  });
});

describe('rankingYears', () => {
  it('counts "doesn’t pay back" as the horizon and "cheaper up front, costs more to run" as 0', () => {
    expect(rankingYears(DOES_NOT_PAY_BACK, 18)).toBe(18);
    expect(rankingYears(CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, 18)).toBe(0);
    expect(rankingYears(7, 18)).toBe(7);
  });
});
