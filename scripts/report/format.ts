// ABOUT: Rounding and number formatting for the phase 1 report, independent of the machine's locale
// ABOUT: Rounds to £10, 100 kWh, 10 kgCO₂e and 5%, groups thousands with commas and writes minus as U+2212

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
