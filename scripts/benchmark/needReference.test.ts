// ABOUT: Tests for the NEED measured-consumption references used in benchmark step 3
// ABOUT: Pins the conversion arithmetic and the three reference readings for the 90 m² archetype

import { describe, expect, it } from 'vitest';
import { conversion, gapFromReference, needReferences, spaceHeatFromGasKwh } from './needReference.ts';

describe('spaceHeatFromGasKwh', () => {
  it('takes boiler losses and hot water off metered gas', () => {
    // 10,000 × 0.85 − 1,700 = 6,800
    expect(spaceHeatFromGasKwh(10_000, 0.85, 1_700)).toBeCloseTo(6_800, 9);
  });
});

describe('gapFromReference', () => {
  it('is measured against the reference, as the decision rule says', () => {
    expect(gapFromReference(13_000, 10_000)).toBeCloseTo(0.3, 12);
    expect(gapFromReference(8_500, 10_000)).toBeCloseTo(-0.15, 12);
  });
});

describe('needReferences', () => {
  const [a, b, c] = needReferences(90);

  it('gives three readings, from size-corrected national to the closest London match', () => {
    expect(needReferences(90)).toHaveLength(3);
    // A: 122.0 × 90 = 10,980
    expect(a?.gasKwh).toBeCloseTo(10_980, 6);
    // B: 10,980 × (125.9 ÷ 104.9) × (107.2 ÷ 104.9) ≈ 13,467
    expect(Math.round(b?.gasKwh ?? 0)).toBe(13_467);
    expect(c?.gasKwh).toBe(15_433);
  });

  it('says how large a house reading C implies', () => {
    // 15,433 ÷ 122.0 ≈ 126.5, so about 127 m²
    expect(c?.caveat).toContain('about 127 m²');
  });

  it('converts to space heat between about 7,600 and 11,400 kWh at the central efficiency', () => {
    const spaceHeat = needReferences(90).map((reference) =>
      spaceHeatFromGasKwh(
        reference.gasKwh,
        conversion.boilerSeasonalEfficiency.value,
        conversion.hotWaterHeatKwh.value,
      ),
    );
    expect(spaceHeat.map((kwh) => Math.round(kwh / 100) * 100)).toEqual([7_600, 9_700, 11_400]);
  });
});
