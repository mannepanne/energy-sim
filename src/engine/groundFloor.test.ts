// ABOUT: Tests for the BS EN ISO 13370 ground floor U-value as RdSAP 10 applies it
// ABOUT: Hand calculations for a solid and a suspended floor, rounding, insulation and edge cases

import { describe, expect, it } from 'vitest';
import { groundFloorUValue, groundFloorUValueExact, type GroundFloor, type GroundFloorParameters } from './groundFloor.ts';

/** RdSAP 10 section 5.12. */
const RDSAP: GroundFloorParameters = {
  soilConductivity: 1.5,
  internalSurfaceResistance: 0.17,
  externalSurfaceResistance: 0.04,
  insulationConductivity: 0.035,
  deckResistance: 0.2,
  heightAboveGround: 0.3,
  windSpeed: 5,
  windShielding: 0.05,
  ventilationOpeningsPerMetre: 0.003,
  underfloorWallUValue: 1.5,
};

const solid: GroundFloor = { construction: 'solid', areaM2: 50, exposedPerimeterM: 20, wallThicknessMm: 250, insulationMm: 0 };

describe('groundFloorUValue', () => {
  it('matches the hand calculation for an uninsulated solid floor (the fixture house)', () => {
    // B = 2 × 50 ÷ 20 = 5; dt = 0.25 + 1.5 × (0.17 + 0.04) = 0.565; U = 2λ ln(πB/dt + 1) ÷ (πB + dt).
    const expected = ((2 * 1.5) / (Math.PI * 5 + 0.565)) * Math.log((Math.PI * 5) / 0.565 + 1);
    expect(groundFloorUValueExact(solid, RDSAP)).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(0.6195, 4);
    expect(groundFloorUValue(solid, RDSAP)).toBe(0.62);
  });

  it('matches the hand calculation for an uninsulated suspended timber floor', () => {
    const floor: GroundFloor = { construction: 'suspendedTimber', areaM2: 43.5, exposedPerimeterM: 9.3274, wallThicknessMm: 220, insulationMm: 0 };
    const b = (2 * 43.5) / 9.3274;
    const dg = 0.22 + 1.5 * 0.21;
    const ug = ((2 * 1.5) / (Math.PI * b + dg)) * Math.log((Math.PI * b) / dg + 1);
    const ux = (2 * 0.3 * 1.5) / b + (1450 * 0.003 * 5 * 0.05) / b;
    const expected = 1 / (2 * 0.17 + 0.2 + 1 / (ug + ux));
    expect(groundFloorUValueExact(floor, RDSAP)).toBeCloseTo(expected, 12);
    expect(groundFloorUValue(floor, RDSAP)).toBe(0.46);
  });

  it('falls with insulation, using the well-insulated formula once dt reaches B', () => {
    const insulated = { ...solid, insulationMm: 100 };
    // dt = 0.25 + 1.5 × (0.17 + 0.1 ÷ 0.035 + 0.04) = 4.851, below B = 5.
    expect(groundFloorUValueExact(insulated, RDSAP)).toBeLessThan(groundFloorUValueExact(solid, RDSAP));
    const thick = { ...solid, insulationMm: 200 };
    const dt = 0.25 + 1.5 * (0.17 + 0.2 / 0.035 + 0.04);
    expect(groundFloorUValueExact(thick, RDSAP)).toBeCloseTo(1.5 / (0.457 * 5 + dt), 12);
    const suspended = { ...solid, construction: 'suspendedTimber' as const };
    expect(groundFloorUValueExact({ ...suspended, insulationMm: 100 }, RDSAP)).toBeLessThan(groundFloorUValueExact(suspended, RDSAP));
  });

  it('falls as the floor gets larger for the same perimeter', () => {
    expect(groundFloorUValueExact({ ...solid, areaM2: 100 }, RDSAP)).toBeLessThan(groundFloorUValueExact(solid, RDSAP));
  });

  it('gives 0 for a floor with no exposed perimeter, and rejects impossible floors', () => {
    expect(groundFloorUValue({ ...solid, exposedPerimeterM: 0 }, RDSAP)).toBe(0);
    expect(() => groundFloorUValue({ ...solid, areaM2: 0 }, RDSAP)).toThrow('positive area');
    expect(() => groundFloorUValue({ ...solid, insulationMm: -1 }, RDSAP)).toThrow('non-negative');
  });
});
