// ABOUT: Tests for derived geometry and the heat loss coefficient: hand calculations for the fixture house and for
// ABOUT: two real archetypes (REFERENCE/engine.md), party walls and thermal bridging, and rejection of bad inputs

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { defaultHouse } from './archetypes.ts';
import { deriveGeometry, heatLoss, type GeometryFacts } from './geometry.ts';
import { readInputs } from './inputs.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

const register = createAccessor(loadRegister(JSON.parse(readFileSync(new URL('../../data/register.json', import.meta.url), 'utf8')) as unknown));

const FIXTURE_FACTS: GeometryFacts = {
  floorAreaM2: 100,
  storeys: 2,
  aspectRatio: 2,
  partyWalls: 1,
  roomHeightM: 2.5,
  upperStoreyAllowanceM: 0,
  windowAreaSlope: 0.1,
  windowAreaInterceptM2: 0,
  doorAreaM2: 2,
};

describe('deriveGeometry', () => {
  it('derives the fixture house by hand: a 5 m × 10 m footprint with one party wall', () => {
    const geometry = deriveGeometry(FIXTURE_FACTS);
    expect(geometry.footprintM2).toBe(50);
    expect(geometry.widthM).toBeCloseTo(5, 12);
    expect(geometry.depthM).toBeCloseTo(10, 12);
    expect(geometry.exposedPerimeterM).toBeCloseTo(20, 12);
    expect(geometry.grossWallAreaM2).toBeCloseTo(100, 12);
    expect(geometry.windowAreaM2).toBeCloseTo(10, 12);
    expect(geometry.externalWallAreaM2).toBeCloseTo(88, 12);
    expect(geometry.partyWallAreaM2).toBeCloseTo(50, 12);
    expect(geometry.roofAreaM2).toBe(50);
    expect(geometry.groundFloorAreaM2).toBe(50);
    expect(geometry.heatedVolumeM3).toBeCloseTo(250, 12);
  });

  it('adds the upper-storey allowance to every storey above the lowest', () => {
    const geometry = deriveGeometry({ ...FIXTURE_FACTS, storeys: 3, upperStoreyAllowanceM: 0.25 });
    expect(geometry.wallHeightM).toBeCloseTo(3 * 2.5 + 2 * 0.25, 12);
    expect(geometry.heatedVolumeM3).toBeCloseTo((100 / 3) * 8, 12);
  });

  it('matches the hand calculation for the 1930s semi (REFERENCE/engine.md)', () => {
    const inputs = readInputs(register, { house: defaultHouse(register, 'semi1930s') });
    // 45 m² footprint at 1.1: width √(45/1.1) = 6.396 m, depth 7.036 m; perimeter 2 × 13.432 − 7.036 = 19.828 m.
    expect(inputs.exposedPerimeterM).toBeCloseTo(19.828, 3);
    // Storeys 2.5 + 2.75 = 5.25 m: gross wall 104.095 m², less 17.855 m² of windows and 1.85 m² of door.
    expect(inputs.windowAreaM2).toBeCloseTo(0.122 * 90 + 6.875, 9);
    expect(inputs.externalWallAreaM2).toBeCloseTo(84.39, 2);
    expect(inputs.partyWallAreaM2).toBeCloseTo(36.937, 3);
    expect(inputs.heatedVolumeM3).toBeCloseTo(236.25, 9);
    expect(inputs.groundFloorUValue).toBe(0.66);
  });

  it('matches the hand calculation for the pre-1900 mid-terrace (REFERENCE/engine.md)', () => {
    const inputs = readInputs(register, { house: defaultHouse(register, 'midTerracePre1900') });
    // 43.5 m² footprint at 2.0: width 4.664 m, depth 9.327 m; two party walls leave front and back, 9.327 m.
    expect(inputs.exposedPerimeterM).toBeCloseTo(9.327, 3);
    // Storeys 2.7 + 2.95 = 5.65 m: gross wall 52.70 m², less 17.489 m² of windows and 1.85 m² of door.
    expect(inputs.externalWallAreaM2).toBeCloseTo(33.361, 3);
    expect(inputs.partyWallAreaM2).toBeCloseTo(105.399, 3);
    expect(inputs.heatedVolumeM3).toBeCloseTo(245.775, 9);
    expect(inputs.groundFloorUValue).toBe(0.46);
  });

  it('gives a mid-terrace less exposed wall than an end-terrace of the same size', () => {
    const end = register.cellNumber('archetypes.floorArea', 'endTerracePre1900');
    const mid = readInputs(register, { house: { ...defaultHouse(register, 'midTerracePre1900'), floorAreaM2: end } });
    const endTerrace = readInputs(register, { house: defaultHouse(register, 'endTerracePre1900') });
    expect(mid.externalWallAreaM2).toBeLessThan(endTerrace.externalWallAreaM2);
    expect(mid.partyWallAreaM2).toBeGreaterThan(endTerrace.partyWallAreaM2);
  });

  it('rejects impossible facts, and windows that do not fit in the wall', () => {
    expect(() => deriveGeometry({ ...FIXTURE_FACTS, floorAreaM2: 0 })).toThrow('positive floor area');
    expect(() => deriveGeometry({ ...FIXTURE_FACTS, storeys: 1.5 })).toThrow('whole number of storeys');
    expect(() => deriveGeometry({ ...FIXTURE_FACTS, aspectRatio: -1 })).toThrow('aspect ratio');
    expect(() => deriveGeometry({ ...FIXTURE_FACTS, partyWalls: 3 })).toThrow('0, 1 or 2 party walls');
    expect(() => deriveGeometry({ ...FIXTURE_FACTS, windowAreaSlope: 2 })).toThrow('do not fit');
    expect(() => deriveGeometry({ ...FIXTURE_FACTS, windowAreaInterceptM2: -20 })).toThrow('do not fit');
  });
});

describe('heatLoss', () => {
  it('reproduces the fixture house by hand: 179 W/K fabric + 66 W/K ventilation = 245 W/K', () => {
    const loss = heatLoss(readInputs(fixtureAccessor()));
    // Walls 88 + windows 30 + door 5 + roof 25 + floor 50 × 0.62 = 179.
    expect(loss.fabricWPerK).toBeCloseTo(179, 12);
    expect(loss.thermalBridgingWPerK).toBe(0);
    expect(loss.ventilationWPerK).toBeCloseTo(66, 12);
    expect(loss.totalWPerK).toBeCloseTo(245, 12);
  });

  it('multiplies fabric, thermal bridging and ventilation by the fabric quality factor', () => {
    expect(heatLoss(readInputs(fixtureAccessor({ 'fabric.qualityFactor': 0.9 }))).totalWPerK).toBeCloseTo(220.5, 12);
  });

  it('adds the party wall at its U-value, and thermal bridging as y × the exposed area', () => {
    const loss = heatLoss(readInputs(fixtureAccessor({ 'fabric.partyWallUValue': 0.25, 'fabric.thermalBridging': 0.1 })));
    // Party wall 50 m² × 0.25 = 12.5; exposed area 88 + 10 + 2 + 50 + 50 = 200 m² × 0.1 = 20.
    expect(loss.fabricWPerK).toBeCloseTo(179 + 12.5, 12);
    expect(loss.thermalBridgingWPerK).toBeCloseTo(20, 12);
    expect(loss.totalWPerK).toBeCloseTo(245 + 12.5 + 20, 12);
  });

  it('rejects negative areas, U-values, air change rates, volumes and bridging, and a non-positive quality factor', () => {
    const inputs = readInputs(fixtureAccessor());
    expect(() => heatLoss({ ...inputs, doorAreaM2: -1 })).toThrow('Element "door" has a negative area or U-value');
    expect(() => heatLoss({ ...inputs, wallUValue: -1 })).toThrow('"external walls"');
    expect(() => heatLoss({ ...inputs, partyWallUValue: -1 })).toThrow('"party walls"');
    expect(() => heatLoss({ ...inputs, airChangesPerHour: -1 })).toThrow('must not be negative');
    expect(() => heatLoss({ ...inputs, heatedVolumeM3: -1 })).toThrow('must not be negative');
    expect(() => heatLoss({ ...inputs, thermalBridgingWPerM2K: -1 })).toThrow('thermal bridging');
    expect(() => heatLoss({ ...inputs, fabricQualityFactor: 0 })).toThrow('must be positive');
  });
});
