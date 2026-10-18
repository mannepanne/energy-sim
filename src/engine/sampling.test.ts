// ABOUT: Checks the seeded draws: reproducible by seed, stable when rows are added or reordered,
// ABOUT: degenerate ranges give the default, and the inverse distribution functions hit their targets

import { describe, expect, it } from 'vitest';
import { UNCERTAIN_ROW_IDS } from './inputs.ts';
import {
  correlatedUniform,
  drawSamples,
  drawValue,
  hash32,
  normalCdf,
  normalInverse,
  sampleOverrides,
  triangularInverse,
  uniformFor,
  type CorrelationSpec,
  type UncertainSpec,
} from './sampling.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

const triangular = (id: string, low: number, mode: number, high: number): UncertainSpec => ({ id, default: mode, low, high, distribution: 'triangular' });
const spf: UncertainSpec = { id: 'heating.heatPumpSpf', default: 2.8, low: 2, high: 4, distribution: 'lognormal', median: 2.8, sigma: 0.145 };

const rowA = triangular('a.first', 0, 1, 4);
const rowB = triangular('b.second', 10, 12, 20);
const rowC = triangular('c.third', -5, 0, 5);

describe('hash32 and uniformFor', () => {
  it('give pinned values, so a change to the hash (which would move every draw) fails here first', () => {
    expect(hash32('')).toBe(2_872_998_923);
    expect(hash32('a')).toBe(444_641_715);
    expect(hash32('1|0|heating.heatPumpSpf')).toBe(4_072_876_525);
    expect(uniformFor(1, 0, 'heating.heatPumpSpf')).toBe((4_072_876_525 + 0.5) / 2 ** 32);
  });

  it('keeps every uniform strictly between 0 and 1', () => {
    for (let sample = 0; sample < 10_000; sample += 1) {
      const u = uniformFor(7, sample, 'row');
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('separates the seed from the sample index', () => {
    expect(uniformFor(1, 23, 'row')).not.toBe(uniformFor(12, 3, 'row'));
  });

  it('spreads uniforms evenly: each tenth holds about a tenth of 100,000 draws', () => {
    const counts = Array.from({ length: 10 }, () => 0);
    for (let sample = 0; sample < 100_000; sample += 1) counts[Math.floor(uniformFor(3, sample, 'row') * 10)]! += 1;
    for (const count of counts) expect(Math.abs(count - 10_000)).toBeLessThan(400);
  });
});

describe('drawSamples', () => {
  it('gives identical results for the same seed', () => {
    expect(drawSamples([rowA, rowB], { seed: 42, count: 50 })).toEqual(drawSamples([rowA, rowB], { seed: 42, count: 50 }));
  });

  it('gives different samples for a different seed', () => {
    const first = drawSamples([rowA], { seed: 42, count: 50 }).map((sample) => sample['a.first']);
    const second = drawSamples([rowA], { seed: 43, count: 50 }).map((sample) => sample['a.first']);
    expect(first).not.toEqual(second);
  });

  it('leaves every existing row’s draws unchanged when a row is added or the rows are reordered', () => {
    const before = drawSamples([rowA, rowB], { seed: 5, count: 100 });
    const added = drawSamples([rowC, rowB, rowA], { seed: 5, count: 100 });
    before.forEach((sample, index) => {
      expect(added[index]!['a.first']).toBe(sample['a.first']);
      expect(added[index]!['b.second']).toBe(sample['b.second']);
    });
  });

  it('keeps every draw within the row’s low and high', () => {
    for (const sample of drawSamples([rowA, rowB, rowC, spf], { seed: 9, count: 2_000 })) {
      expect(sample['a.first']).toBeGreaterThanOrEqual(0);
      expect(sample['a.first']).toBeLessThanOrEqual(4);
      expect(sample['heating.heatPumpSpf']).toBeGreaterThanOrEqual(2);
      expect(sample['heating.heatPumpSpf']).toBeLessThanOrEqual(4);
    }
  });

  it('rejects a seed or count that is not a whole number', () => {
    expect(() => drawSamples([rowA], { seed: -1, count: 10 })).toThrow(/Seed/);
    expect(() => drawSamples([rowA], { seed: 1.5, count: 10 })).toThrow(/Seed/);
    expect(() => drawSamples([rowA], { seed: 1, count: 0 })).toThrow(/count/);
  });
});

describe('drawValue', () => {
  it('always returns the default for a row whose low equals its high, with no division by zero', () => {
    const flat = triangular('flat.row', 3, 3, 3);
    for (const u of [1e-9, 0.25, 0.5, 0.999999]) expect(drawValue(flat, u)).toBe(3);
    expect(drawValue({ ...spf, low: 2.8, high: 2.8 }, 0.01)).toBe(2.8);
  });

  it('throws for a lognormal row with no median or sigma', () => {
    expect(() => drawValue({ ...spf, sigma: undefined }, 0.5)).toThrow(/heatPumpSpf/);
  });
});

describe('triangularInverse', () => {
  it('returns the mode at the split point and the ends at 0 and 1', () => {
    expect(triangularInverse(0, 0, 1, 4)).toBe(0);
    expect(triangularInverse(0.25, 0, 1, 4)).toBeCloseTo(1, 12);
    expect(triangularInverse(1, 0, 1, 4)).toBe(4);
  });

  it('handles a mode at the low or the high end', () => {
    expect(triangularInverse(0.5, 0, 0, 1)).toBeCloseTo(1 - Math.sqrt(0.5), 12);
    expect(triangularInverse(0.5, 0, 1, 1)).toBeCloseTo(Math.sqrt(0.5), 12);
  });

  it('gives the mean (low + mode + high) ÷ 3 over many draws', () => {
    const draws = drawSamples([rowB], { seed: 1, count: 100_000 }).map((sample) => sample['b.second']!);
    const mean = draws.reduce((total, value) => total + value, 0) / draws.length;
    expect(mean).toBeCloseTo((10 + 12 + 20) / 3, 1);
  });
});

describe('normalInverse', () => {
  it('matches standard normal quantiles in the centre and both tails', () => {
    expect(normalInverse(0.5)).toBeCloseTo(0, 9);
    expect(normalInverse(0.975)).toBeCloseTo(1.959964, 6);
    expect(normalInverse(0.025)).toBeCloseTo(-1.959964, 6);
    expect(normalInverse(0.001)).toBeCloseTo(-3.090232, 6);
    expect(normalInverse(0.999)).toBeCloseTo(3.090232, 6);
  });
});

describe('normalCdf', () => {
  it('matches standard normal probabilities in the centre and both tails', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 14);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 7);
    expect(normalCdf(-1)).toBeCloseTo(0.158655253931457, 13);
    expect(Math.abs(normalCdf(-8) / 6.22096057427178e-16 - 1)).toBeLessThan(1e-7);
    expect(normalCdf(40)).toBe(1);
    expect(normalCdf(-40)).toBe(0);
  });

  it('inverts normalInverse to within 1e-8 across the range', () => {
    for (const u of [1e-9, 0.001, 0.02, 0.3, 0.5, 0.77, 0.98, 0.999999]) expect(normalCdf(normalInverse(u))).toBeCloseTo(u, 8);
  });
});

/** Pearson correlation of two equal-length arrays. */
const mean = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0) / values.length;

function pearson(a: readonly number[], b: readonly number[]): number {
  const [meanA, meanB] = [mean(a), mean(b)];
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  a.forEach((value, index) => {
    covariance += (value - meanA) * (b[index]! - meanB);
    varianceA += (value - meanA) ** 2;
    varianceB += (b[index]! - meanB) ** 2;
  });
  return covariance / Math.sqrt(varianceA * varianceB);
}

describe('the Gaussian copula', () => {
  const pair: CorrelationSpec = { anchor: 'a.first', partner: 'b.second', value: 0.6 };
  const plan = { seed: 11, count: 100_000 };
  const draws = drawSamples([rowA, rowB, rowC], plan, [pair]);
  const scores = (id: 'a.first' | 'b.second' | 'c.third', row: UncertainSpec): number[] =>
    draws.map((sample) => normalInverse(Math.min(1 - 1e-12, Math.max(1e-12, cdfOf(row, sample[id]!)))));

  it('gives the same correlated draws for the same seed', () => {
    expect(drawSamples([rowA, rowB], { seed: 4, count: 20 }, [pair])).toEqual(drawSamples([rowA, rowB], { seed: 4, count: 20 }, [pair]));
  });

  it('matches the correlation row within 0.05 on normal scores over 100,000 draws', () => {
    expect(Math.abs(pearson(scores('a.first', rowA), scores('b.second', rowB)) - 0.6)).toBeLessThan(0.05);
  });

  it('keeps uncorrelated rows independent, and leaves the anchor and other rows with their own draws', () => {
    expect(Math.abs(pearson(scores('a.first', rowA), scores('c.third', rowC)))).toBeLessThan(0.02);
    const independent = drawSamples([rowA, rowB, rowC], plan);
    draws.forEach((sample, index) => {
      expect(sample['a.first']).toBe(independent[index]!['a.first']);
      expect(sample['c.third']).toBe(independent[index]!['c.third']);
    });
    expect(draws.some((sample, index) => sample['b.second'] !== independent[index]!['b.second'])).toBe(true);
  });

  it('gives a negative correlation for a negative row', () => {
    const negative = drawSamples([rowA, rowB], { seed: 2, count: 20_000 }, [{ ...pair, value: -0.5 }]);
    expect(pearson(negative.map((sample) => sample['a.first']!), negative.map((sample) => sample['b.second']!))).toBeLessThan(-0.4);
  });

  it('keeps a correlated uniform strictly inside (0, 1), even at extreme normal scores', () => {
    const tiny = 0.5 / 2 ** 32;
    expect(correlatedUniform(tiny, tiny, 0.99)).toBeGreaterThan(0);
    expect(correlatedUniform(1 - tiny, 1 - tiny, 0.99)).toBeLessThan(1);
    expect(drawValue(spf, correlatedUniform(1 - tiny, 1 - tiny, 0.99))).toBeLessThanOrEqual(4);
  });

  it('rejects a correlation that names an unsampled row, repeats a row, or lies outside (−1, 1)', () => {
    const small = { seed: 1, count: 1 };
    expect(() => drawSamples([rowA], small, [pair])).toThrow('"b.second", which is not among the sampled rows');
    expect(() => drawSamples([rowA, rowB, rowC], small, [pair, { anchor: 'c.third', partner: 'a.first', value: 0.1 }])).toThrow('more than one correlation');
    expect(() => drawSamples([rowA, rowB], small, [{ ...pair, value: 1 }])).toThrow('strictly between');
  });
});

/** The CDF of a triangular spec, to turn draws back into uniforms. */
function cdfOf(row: UncertainSpec, x: number): number {
  const { low, default: mode, high } = row;
  return x <= mode ? ((x - low) ** 2) / ((high - low) * (mode - low)) : 1 - ((high - x) ** 2) / ((high - low) * (high - mode));
}

describe('the lognormal SPF row', () => {
  it('reproduces its target percentiles to within 2 percentage points over 100,000 draws', () => {
    // Median 2.8, sigma 0.145: P(SPF > 3.0) = 1 − Φ(ln(3.0/2.8)/0.145) ≈ 31.7%, P(SPF > 3.5) = 1 − Φ(ln(3.5/2.8)/0.145) ≈ 6.2%.
    const draws = drawSamples([spf], { seed: 2026, count: 100_000 }).map((sample) => sample['heating.heatPumpSpf']!);
    const share = (threshold: number): number => draws.filter((value) => value > threshold).length / draws.length;
    expect(Math.abs(share(3.0) - 0.317)).toBeLessThan(0.02);
    expect(Math.abs(share(3.5) - 0.062)).toBeLessThan(0.02);
    expect(Math.abs(share(2.8) - 0.5)).toBeLessThan(0.02);
  });
});

describe('sampleOverrides', () => {
  it('never samples a row that prepareWeather reads, because the weather is prepared once for every sample', () => {
    const weatherRows: readonly string[] = ['weather.irradianceSampleMinute', 'gains.groundReflectance'];
    for (const id of UNCERTAIN_ROW_IDS) expect(weatherRows).not.toContain(id);
  });

  it('draws every uncertain row the engine reads', () => {
    const access = fixtureAccessor({}, { 'heating.heatPumpSpf': { low: 2, high: 3.5, sigma: 0.15 } });
    const [first] = sampleOverrides(access, { seed: 1, count: 1 });
    expect(Object.keys(first!).toSorted()).toEqual(UNCERTAIN_ROW_IDS.toSorted());
    expect(first!['fabric.qualityFactor']).toBe(1);
    expect(first!['heating.heatPumpSpf']).not.toBe(2.5);
  });
});
