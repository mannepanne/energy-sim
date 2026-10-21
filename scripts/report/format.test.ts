// ABOUT: Checks the report's rounding and number formatting, including negatives, −0 and the 5% share steps
// ABOUT: Formatting never depends on the machine's locale, so the committed report stays byte-identical

import { describe, expect, it } from 'vitest';
import { CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, DOES_NOT_PAY_BACK } from '../../src/engine/payback.ts';
import { celsius, exactNumber, kgCo2e, kwh, paybackYears, pence, plainValue, pounds, range, roundTo, share, signedPercent, wholeNumber } from './format.ts';

describe('roundTo', () => {
  it('rounds half away from zero, symmetrically for negatives', () => {
    expect(roundTo(15, 10)).toBe(20);
    expect(roundTo(-15, 10)).toBe(-20);
    expect(roundTo(14.9, 10)).toBe(10);
  });

  it('never returns −0', () => {
    expect(Object.is(roundTo(-4, 10), 0)).toBe(true);
  });
});

describe('formatters', () => {
  it('groups thousands with commas and writes minus as U+2212', () => {
    expect(wholeNumber(13_124.4)).toBe('13,124');
    expect(wholeNumber(1_234_567)).toBe('1,234,567');
    expect(wholeNumber(-1_200)).toBe('−1,200');
    expect(wholeNumber(-0.2)).toBe('0');
    expect(() => wholeNumber(Number.NaN)).toThrow(/Cannot format/);
  });

  it('rounds to £10, 100 kWh and 10 kg', () => {
    expect(pounds(2_012.4)).toBe('£2,010');
    expect(pounds(-168)).toBe('−£170');
    expect(pounds(-3)).toBe('£0');
    expect(kwh(13_124)).toBe('13,100 kWh');
    expect(kgCo2e(2_761)).toBe('2,760 kg');
  });

  it('rounds shares to the nearest 5%', () => {
    expect(share(0.638)).toBe('65%');
    expect(share(0.5)).toBe('50%');
    expect(share(0.024)).toBe('0%');
  });

  it('writes signed percentages with U+2212 for minus', () => {
    expect(signedPercent(-0.1568, 1)).toBe('\u221215.7%');
    expect(signedPercent(0.04, 1)).toBe('+4.0%');
    expect(signedPercent(0.00001, 1)).toBe('0.0%');
  });

  it('writes row values at their natural precision', () => {
    expect(plainValue(0.85)).toBe('0.85');
    expect(plainValue(15.74)).toBe('15.7');
    expect(plainValue(3_800)).toBe('3,800');
    expect(plainValue(-0.128)).toBe('−0.128');
    expect(exactNumber(-0.128)).toBe('−0.128');
    expect(exactNumber(51.507)).toBe('51.507');
  });
});

describe('paybackYears', () => {
  it('rounds to whole years and names year 0, "beyond lifetime" and cheaper up front', () => {
    expect(paybackYears(0)).toBe('at once');
    expect(paybackYears(0.4)).toBe('at once');
    expect(paybackYears(1)).toBe('1 year');
    expect(paybackYears(12.5)).toBe('13 years');
    expect(paybackYears(DOES_NOT_PAY_BACK)).toBe('beyond lifetime');
    expect(paybackYears(CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN)).toBe('cheaper up front, costs more to run');
  });

  it('throws on any other negative year or NaN', () => {
    expect(() => paybackYears(-2)).toThrow('Cannot format');
    expect(() => paybackYears(Number.NaN)).toThrow('Cannot format');
  });
});

describe('pence, celsius and range', () => {
  it('formats pence and temperatures to fixed places, and collapses a range whose ends match', () => {
    expect(pence(26.6)).toBe('26.60p');
    expect(celsius(17.64)).toBe('17.6 °C');
    expect(range('£10', '£10')).toBe('£10');
    expect(range('£10', '£20')).toBe('£10 to £20');
  });
});
