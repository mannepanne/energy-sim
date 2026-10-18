// ABOUT: Seeded, stable draws for uncertain register rows: a hash of (seed, sample, row id) gives a uniform number
// ABOUT: A Gaussian copula correlates register-named pairs; inverse distribution functions turn uniforms into values

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

// Coefficients of Hart's (1968) double-precision approximation to the standard normal CDF, as given by
// West (2005), "Better approximations to cumulative normal functions". Algorithm constants, not model numbers.
const HART_NUMERATOR = [0.0352624965998911, 0.700383064443688, 6.37396220353165, 33.912866078383, 112.079291497871, 221.213596169931, 220.206867912376];
const HART_DENOMINATOR = [
  0.0883883476483184, 1.75566716318264, 16.064177579207, 86.7807322029461, 296.564248779674, 637.333633378831, 793.826512519948,
  440.413735824752,
];
const HART_SWITCH = 7.07106781186547;
const HART_ZERO_BEYOND = 37;
const SQRT_TWO_PI = 2.506628274631;

/** Standard normal CDF Φ(z), accurate to about 1e-14. */
export function normalCdf(z: number): number {
  const x = Math.abs(z);
  let tail: number;
  if (x > HART_ZERO_BEYOND) tail = 0;
  else if (x < HART_SWITCH) {
    tail = (Math.exp((-x * x) / 2) * polynomial(HART_NUMERATOR, x)) / polynomial(HART_DENOMINATOR, x);
  } else {
    const fraction = x + 1 / (x + 2 / (x + 3 / (x + 4 / (x + 0.65))));
    tail = Math.exp((-x * x) / 2) / fraction / SQRT_TWO_PI;
  }
  return z > 0 ? 1 - tail : tail;
}

/** The smallest and largest uniforms `uniformFor` can give, so a copula draw stays inside the same open interval. */
const UNIFORM_MIN = 0.5 / UINT32_RANGE;
const UNIFORM_MAX = 1 - UNIFORM_MIN;

/**
 * A Gaussian copula pair. The anchor keeps its own draw. The partner's normal score becomes
 * ρ·z_anchor + √(1 − ρ²)·z_partner, so ρ is the correlation of the two rows' normal scores.
 */
export interface CorrelationSpec {
  anchor: string;
  partner: string;
  value: number;
}

/** The partner's correlated uniform, from the anchor's and the partner's own uniforms. */
export function correlatedUniform(anchorU: number, partnerU: number, correlation: number): number {
  const z = correlation * normalInverse(anchorU) + Math.sqrt(1 - correlation * correlation) * normalInverse(partnerU);
  return Math.min(UNIFORM_MAX, Math.max(UNIFORM_MIN, normalCdf(z)));
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

function checkCorrelations(rows: readonly UncertainSpec[], correlations: readonly CorrelationSpec[]): void {
  const ids = new Set(rows.map((row) => row.id));
  const paired = new Set<string>();
  for (const { anchor, partner, value } of correlations) {
    for (const id of [anchor, partner]) {
      if (!ids.has(id)) throw new Error(`A correlation names "${id}", which is not among the sampled rows`);
      if (paired.has(id)) throw new Error(`Row "${id}" is in more than one correlation`);
      paired.add(id);
    }
    if (!(value > -1 && value < 1)) throw new Error(`A correlation must lie strictly between −1 and 1, got ${value}`);
  }
}

/**
 * One value per row per sample, keyed by row id. Each uniform depends only on (seed, sample, row id), so adding
 * or reordering rows never moves another row's draws. A correlated partner also depends on its anchor's uniform.
 */
export function drawSamples<Id extends string>(
  rows: readonly (UncertainSpec & { id: Id })[],
  plan: SamplingPlan,
  correlations: readonly CorrelationSpec[] = [],
): Partial<Record<Id, number>>[] {
  checkPlan(plan);
  checkCorrelations(rows, correlations);
  const partnerOf = new Map(correlations.map((pair) => [pair.partner, pair]));
  return Array.from({ length: plan.count }, (_, sample) => {
    const values: Partial<Record<Id, number>> = {};
    for (const row of rows) {
      const pair = partnerOf.get(row.id);
      const own = uniformFor(plan.seed, sample, row.id);
      const u = pair ? correlatedUniform(uniformFor(plan.seed, sample, pair.anchor), own, pair.value) : own;
      values[row.id] = drawValue(row, u);
    }
    return values;
  });
}

/** The register's correlation rows as copula pairs. */
export function correlationSpecs(access: RegisterAccessor): CorrelationSpec[] {
  return access.correlations().map((row) => ({ anchor: row.between[0], partner: row.between[1], value: row.value }));
}

/** Joint draws of every uncertain row the engine reads, ready to pass to `readInputs` as overrides. */
export function sampleOverrides(access: RegisterAccessor, plan: SamplingPlan): UncertainOverrides[] {
  const rows = UNCERTAIN_ROW_IDS.map((id) => ({ ...access.uncertain(id), id }));
  return drawSamples(rows, plan, correlationSpecs(access));
}
