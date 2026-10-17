// ABOUT: Tests for the benchmark step 1 estimate built from the draft archetype values
// ABOUT: Pins H and the headline results, and checks the README shows the current output

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { londonClimate, uValues } from './draftValues.ts';
import { ROOF_VARIANTS, resultsMarkdown, roughEstimate } from './roughEstimate.ts';

describe('roughEstimate', () => {
  it('reproduces the hand-calculated H for the main case (100 mm loft insulation)', () => {
    // Net wall 100 − 17.855 − 1.85 = 80.295 m². Walls 80.295 × 1.5 + windows 17.855 × 2.8
    // + door 1.85 × 3.0 + roof 45 × 0.4 + floor 45 × 0.75 = 120.4425 + 49.994 + 5.55 + 18 + 33.75
    // = 227.7365; ventilation 0.33 × 1.0 × 225 = 74.25
    const result = roughEstimate(uValues.roof.value);
    expect(result.heatLoss.fabricWPerK).toBeCloseTo(227.7365, 3);
    expect(result.heatLoss.ventilationWPerK).toBeCloseTo(74.25, 10);
    expect(result.heatLoss.totalWPerK).toBeCloseTo(301.9865, 3);
  });

  it('reproduces the hand-calculated H for the no-insulation variant', () => {
    // As above with roof 45 × 2.3 = 103.5 in place of 18: fabric 313.2365, total 387.4865
    const result = roughEstimate(uValues.roofNoInsulation.value);
    expect(result.heatLoss.totalWPerK).toBeCloseTo(387.4865, 3);
  });

  it('pins the headline results for both roof variants', () => {
    const main = roughEstimate(uValues.roof.value);
    expect(main.balancePointC).toBeCloseTo(15.68, 2);
    expect(Math.round(main.degreeDays)).toBe(1798);
    expect(Math.round(main.annualSpaceHeatKwh / 100) * 100).toBe(13000);

    const variant = roughEstimate(uValues.roofNoInsulation.value);
    expect(variant.balancePointC).toBeCloseTo(16.19, 2);
    expect(Math.round(variant.degreeDays)).toBe(1934);
    expect(Math.round(variant.annualSpaceHeatKwh / 100) * 100).toBe(18000);
  });

  it('gives less space heat with 100 mm of loft insulation than with none', () => {
    const [main, variant] = ROOF_VARIANTS.map((roof) => roughEstimate(roof.uValue.value));
    expect(main?.annualSpaceHeatKwh).toBeLessThan(variant?.annualSpaceHeatKwh ?? 0);
  });

  it('uses a full year of London climate data', () => {
    expect(londonClimate.months.reduce((sum, month) => sum + month.days, 0)).toBe(365);
  });
});

describe('resultsMarkdown', () => {
  it('matches the results section of the benchmark README', () => {
    const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    expect(readme, 'Run `npm run benchmark:rough` and paste its output into the README').toContain(
      resultsMarkdown(),
    );
  });

  it('shows H and annual space heat for each roof variant', () => {
    const markdown = resultsMarkdown();
    expect(markdown).toContain('| **H** | | | **302** | **387** |');
    expect(markdown).toContain('| **Annual space heat** | **13,000 kWh** | **18,000 kWh** |');
  });
});
