// ABOUT: Seeded, stable draws for uncertain register rows: a hash of (seed, sample, row id) gives a uniform number
// ABOUT: Inverse distribution functions turn it into a value, so adding or reordering rows never shifts other draws

import type { RegisterAccessor } from '../register/access.ts';
import type { UncertainRow } from '../register/schema.ts';
import { UNCERTAIN_ROW_IDS, type UncertainOverrides } from './inputs.ts';

/** The fields of an uncertain row that a draw needs. */
export type UncertainSpec = Pick<UncertainRow, 'id' | 'default' | 'low' | 'high' | 'distribution' | 'median' | 'sigma'>;

const UINT32_RANGE = 2 ** 32;

/**
 * FNV-1a over the text's UTF-16 code units, then the murmur3 finaliser to spread the bits. Returns an unsigned 32-bit integer.
 * It is fast and reproducible, not cryptographic: never use it for anything security-related.
 */
export function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * The uniform number for one row in one sample, strictly between 0 and 1.
 * The separators stop (seed 1, sample 23) and (seed 12, sample 3) hashing the same text.
 */
export function uniformFor(seed: number, sample: number, rowId: string): number {
  return (hash32(`${seed}|${sample}|${rowId}`) + 0.5) / UINT32_RANGE;
}

/** Inverse CDF of a triangular distribution with the given low, mode and high. */
export function triangularInverse(u: number, low: number, mode: number, high: number): number {
  const width = high - low;
  const split = (mode - low) / width;
  return u < split ? low + Math.sqrt(u * width * (mode - low)) : high - Math.sqrt((1 - u) * width * (high - mode));
}

// Coefficients of Acklam's rational approximation to the inverse standard normal CDF
// (relative error below 1.2e-9). These are algorithm constants, not model numbers.
const ACKLAM_A = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
const ACKLAM_B = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
const ACKLAM_C = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ACKLAM_D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
const ACKLAM_TAIL = 0.02425;

const polynomial = (coefficients: readonly number[], x: number): number => coefficients.reduce((total, coefficient) => total * x + coefficient, 0);

/** Inverse standard normal CDF, for u strictly between 0 and 1. */
export function normalInverse(u: number): number {
  if (u < ACKLAM_TAIL) {
    const q = Math.sqrt(-2 * Math.log(u));
    return polynomial(ACKLAM_C, q) / (polynomial(ACKLAM_D, q) * q + 1);
  }
  if (u > 1 - ACKLAM_TAIL) {
    const q = Math.sqrt(-2 * Math.log(1 - u));
    return -polynomial(ACKLAM_C, q) / (polynomial(ACKLAM_D, q) * q + 1);
  }
  const q = u - 0.5;
  const r = q * q;
  return (polynomial(ACKLAM_A, r) * q) / (polynomial(ACKLAM_B, r) * r + 1);
}

/** The row's value for a uniform number u. A row whose low equals its high always gives its default. */
export function drawValue(row: UncertainSpec, u: number): number {
  if (row.low === row.high) return row.default;
  if (row.distribution === 'triangular') return triangularInverse(u, row.low, row.default, row.high);
  if (row.median === undefined || row.sigma === undefined) throw new Error(`Lognormal row "${row.id}" needs a median and a sigma`);
  const value = row.median * Math.exp(row.sigma * normalInverse(u));
  return Math.min(row.high, Math.max(row.low, value));
}

export interface SamplingPlan {
  /** A non-negative whole number. */
  seed: number;
  /** The number of samples, at least 1. */
  count: number;
}

function checkPlan({ seed, count }: SamplingPlan): void {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(`Seed must be a non-negative whole number, got ${seed}`);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`Sample count must be a whole number of at least 1, got ${count}`);
}

/** One value per row per sample, keyed by row id. Each draw depends only on (seed, sample, row id). */
export function drawSamples<Id extends string>(rows: readonly (UncertainSpec & { id: Id })[], plan: SamplingPlan): Partial<Record<Id, number>>[] {
  checkPlan(plan);
  return Array.from({ length: plan.count }, (_, sample) => {
    const values: Partial<Record<Id, number>> = {};
    for (const row of rows) values[row.id] = drawValue(row, uniformFor(plan.seed, sample, row.id));
    return values;
  });
}

/** Joint draws of every uncertain row the engine reads, ready to pass to `readInputs` as overrides. */
export function sampleOverrides(access: RegisterAccessor, plan: SamplingPlan): UncertainOverrides[] {
  const rows = UNCERTAIN_ROW_IDS.map((id) => ({ ...access.uncertain(id), id }));
  return drawSamples(rows, plan);
}
