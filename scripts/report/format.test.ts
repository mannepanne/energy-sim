// ABOUT: Checks the report's rounding and number formatting, including negatives, −0 and the 5% share steps
// ABOUT: Formatting never depends on the machine's locale, so the committed report stays byte-identical

import { describe, expect, it } from 'vitest';
import { exactNumber, kgCo2e, kwh, plainValue, pounds, roundTo, share, signedPercent, wholeNumber } from './format.ts';

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
