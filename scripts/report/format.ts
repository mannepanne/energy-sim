// ABOUT: Rounding and number formatting for the reports and tables, independent of the machine's locale
// ABOUT: Rounds to £10, 100 kWh, 10 kgCO₂e, 5% and whole payback years, groups thousands with commas and writes minus as U+2212

import { CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN, DOES_NOT_PAY_BACK } from '../../src/engine/payback.ts';

const MINUS = '−';

/** Rounds to the nearest multiple of `step`, half away from zero, and never returns −0. */
export function roundTo(value: number, step: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) / step) * step;
  return rounded === 0 ? 0 : rounded;
}

/** A whole number with comma thousands separators, for example "13,100" or "−1,200". */
export function wholeNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Cannot format ${value}`);
  const rounded = Math.round(Math.abs(value));
  const digits = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded === 0 || value > 0 ? digits : `${MINUS}${digits}`;
}

export const pounds = (value: number): string => {
  const rounded = roundTo(value, 10);
  return rounded < 0 ? `${MINUS}£${wholeNumber(-rounded)}` : `£${wholeNumber(rounded)}`;
};

export const kwh = (value: number): string => `${wholeNumber(roundTo(value, 100))} kWh`;

export const kgCo2e = (value: number): string => `${wholeNumber(roundTo(value, 10))} kg`;

/** A share from 0 to 1, as a percentage rounded to the nearest 5%. */
export const share = (fraction: number): string => `${roundTo(fraction * 100, 5)}%`;

/** A row value at its natural precision: up to three significant decimals, trailing zeros dropped. */
export function plainValue(value: number): string {
  const text = Math.abs(value) >= 100 ? wholeNumber(value) : String(Number(value.toPrecision(3)));
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

/** A fraction as a signed percentage, for example "−15.7%" or "+4.0%". */
export function signedPercent(fraction: number, places: number): string {
  const rounded = Number((fraction * 100).toFixed(places));
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '';
  return `${sign}${Math.abs(rounded).toFixed(places)}%`;
}

/** A number exactly as stored, with U+2212 for minus. */
export const exactNumber = (value: number): string => String(value).replace('-', MINUS);

/** Pence to two decimals, for example "26.60p". */
export const pence = (value: number): string => `${value.toFixed(2)}p`;

export const celsius = (value: number): string => `${value.toFixed(1)} °C`;

/** "low to high", or one value when both ends round the same. */
export const range = (low: string, high: string): string => (low === high ? low : `${low} to ${high}`);

/**
 * A payback year, rounded to a whole year (an interpolated percentile can fall between two): "at once" for year 0,
 * "beyond lifetime" for a sample that doesn't pay back, and the words for one cheaper up front that costs more to run.
 */
export function paybackYears(year: number): string {
  if (year === DOES_NOT_PAY_BACK) return 'beyond lifetime';
  if (year === CHEAPER_UP_FRONT_COSTS_MORE_TO_RUN) return 'cheaper up front, costs more to run';
  if (!(year >= 0)) throw new Error(`Cannot format a payback year of ${year}`);
  const whole = Math.round(year);
  if (whole === 0) return 'at once';
  return whole === 1 ? '1 year' : `${whole} years`;
}
