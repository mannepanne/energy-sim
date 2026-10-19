// ABOUT: Tests for the archetypes and quick facts on the real register: table key parity, defaults,
// ABOUT: SAP occupancy, the wall answers each construction offers, and agreement with the NEED pre-registration

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import type { TableKeyKind } from '../register/schema.ts';
import {
  ARCHETYPE_KEYS,
  archetypeFacts,
  bandConstructionKey,
  checkHouse,
  defaultHouse,
  defaultOccupants,
  GLAZING_ANSWERS,
  LOFT_ANSWERS,
  sapOccupancy,
  wallAnswers,
  WALL_ANSWERS,
  WALL_CONSTRUCTIONS,
} from './archetypes.ts';
import { readInputs } from './inputs.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

const register = loadRegister(JSON.parse(readFileSync(new URL('../../data/register.json', import.meta.url), 'utf8')) as unknown);
const access = createAccessor(register);
const sorted = (keys: Iterable<string>): string[] => [...new Set(keys)].toSorted();
const facts = ARCHETYPE_KEYS.map((key) => archetypeFacts(access, key));
const bandsUsed = sorted(facts.map((fact) => fact.ageBand));

/**
 * The keys each kind of table must hold exactly, or undefined for kinds whose keys are fixed by the engine's own
 * reads (coefficients and parameters, which every archetype reads in the test below).
 */
const EXPECTED_KEYS: Record<TableKeyKind, string[] | undefined> = {
  archetype: sorted(ARCHETYPE_KEYS),
  'age band': bandsUsed,
  construction: sorted(facts.map((fact) => fact.wallConstruction)),
  'age band/construction': sorted(facts.map(bandConstructionKey)),
  'age band/construction/answer': undefined,
  'loft answer': sorted(LOFT_ANSWERS),
  'glazing answer': sorted(GLAZING_ANSWERS),
  coefficient: undefined,
  parameter: undefined,
};

describe('table key parity on the real register', () => {
  it('gives every table exactly the keys its kind needs', () => {
    const tables = register.rows.flatMap((row) => (row.kind === 'table' ? [row] : []));
    expect(tables.length).toBeGreaterThanOrEqual(27);
    const checked = tables.flatMap((row) => {
      const expected = EXPECTED_KEYS[row.keyedBy];
      return expected ? [{ id: row.id, keys: sorted(row.cells.map((cell) => cell.key)), expected }] : [];
    });
    expect(checked.length).toBeGreaterThanOrEqual(24);
    for (const { id, keys, expected } of checked) expect({ id, keys }).toEqual({ id, keys: expected });
  });

  it('gives the wall table an "as built" value for every archetype, and only answers and bands that exist', () => {
    const keys = access.table('fabric.wallUValue').cells.map((cell) => cell.key);
    for (const fact of facts) expect(keys).toContain(`${fact.ageBand}/${fact.wallConstruction}/asBuilt`);
    for (const key of keys) {
      const [band, construction, answer] = key.split('/');
      expect({ key, band: bandsUsed.includes(band!), construction: WALL_CONSTRUCTIONS.some((value) => value === construction), answer: WALL_ANSWERS.some((value) => value === answer) }).toEqual({ key, band: true, construction: true, answer: true });
    }
  });

  it('gives every quick-facts answer a value, and every archetype a wall thickness', () => {
    expect(access.table('fabric.roofUValue').cells.map((cell) => cell.key).toSorted()).toEqual([...LOFT_ANSWERS].toSorted());
    expect(access.table('fabric.windowUValue').cells.map((cell) => cell.key).toSorted()).toEqual([...GLAZING_ANSWERS].toSorted());
    expect(access.table('gains.windowGValue').cells.map((cell) => cell.key).toSorted()).toEqual([...GLAZING_ANSWERS].toSorted());
    for (const fact of facts) expect(access.cellNumber('archetypes.wallThickness', bandConstructionKey(fact))).toBeGreaterThan(0);
  });

  it('reads every archetype at its defaults, and with every loft and glazing answer', () => {
    for (const archetype of ARCHETYPE_KEYS) {
      const house = defaultHouse(access, archetype);
      expect(readInputs(access, { house }).house).toEqual(house);
      for (const loft of LOFT_ANSWERS) for (const glazing of GLAZING_ANSWERS) readInputs(access, { house: { ...house, loft, glazing } });
      for (const walls of wallAnswers(access, archetype)) readInputs(access, { house: { ...house, walls } });
    }
  });
});

describe('the archetypes', () => {
  it('describe the phase 1 house as the 1930s semi', () => {
    expect(archetypeFacts(access, 'semi1930s')).toEqual({
      houseType: 'semiDetached',
      ageBand: 'C',
      storeys: 2,
      wallConstruction: 'cavity',
      defaultFloorAreaM2: 90,
      bedrooms: 3,
      aspectRatio: 1.1,
      partyWalls: 1,
    });
    expect(defaultHouse(access, 'semi1930s')).toEqual({
      archetype: 'semi1930s',
      floorAreaM2: 90,
      occupants: 3,
      loft: 'about100mm',
      walls: 'cavityFilled',
      glazing: 'olderDouble',
    });
  });

  it('offer only the wall answers that fit the construction', () => {
    expect(wallAnswers(access, 'midTerracePre1900')).toEqual(['asBuilt', 'solidWallInsulated']);
    expect(wallAnswers(access, 'semi1930s')).toEqual(['asBuilt', 'cavityFilled']);
    expect(wallAnswers(access, 'midTerrace2010s')).toEqual(['asBuilt']);
  });

  it('reject a house whose answers or inputs do not fit', () => {
    const semi = defaultHouse(access, 'semi1930s');
    expect(defaultHouse(access, 'midTerracePre1900').walls).toBe('asBuilt');
    expect(defaultHouse(access, 'midTerrace2010s').walls).toBe('asBuilt');
    expect(() => checkHouse(access, { ...semi, walls: 'solidWallInsulated' })).toThrow(
      'Wall answer "solidWallInsulated" does not fit archetype "semi1930s"; it offers asBuilt, cavityFilled',
    );
    expect(() => readInputs(access, { house: { ...semi, walls: 'cavityFilled', archetype: 'midTerracePre1900' } })).toThrow('does not fit');
    expect(() => checkHouse(access, { ...semi, floorAreaM2: 0 })).toThrow('Floor area');
    expect(() => checkHouse(access, { ...semi, occupants: 6 })).toThrow('Occupants must be a whole number from 1 to 5');
    expect(() => checkHouse(access, { ...semi, occupants: 2.5 })).toThrow('Occupants');
  });

  it('reject an unknown categorical value in the register', () => {
    expect(() => archetypeFacts(fixtureAccessor({ 'archetypes.wallConstruction': 'cob' }), 'semi1930s')).toThrow('Unknown wall construction "cob"');
    expect(() => defaultHouse(fixtureAccessor({ 'archetypes.defaultLoftAnswer': 'lots' }), 'semi1930s')).toThrow('Unknown loft answer "lots"');
    expect(() => readInputs(fixtureAccessor({ 'archetypes.groundFloorConstruction': 'slab' }))).toThrow('Unknown ground floor construction "slab"');
  });
});

describe('SAP occupancy', () => {
  it('follows SAP 10.2 Table 1b', () => {
    const above = 90 - 13.9;
    expect(sapOccupancy(access, 90)).toBeCloseTo(1 + 1.76 * (1 - Math.exp(-0.000349 * above ** 2)) + 0.0013 * above, 12);
    expect(sapOccupancy(access, 90)).toBeCloseTo(2.63, 2);
    expect(sapOccupancy(access, 10)).toBe(1);
  });

  it('rounds to a default occupant count within 1–5', () => {
    expect(defaultOccupants(access, 90)).toBe(3);
    expect(defaultOccupants(access, 73)).toBe(2);
    expect(defaultOccupants(access, 20)).toBe(1);
    expect(defaultOccupants(fixtureAccessor({ 'archetypes.occupancy': { base: 9, saturation: 0, curvature: 0, slope: 0, minimumFloorArea: 0 } }), 90)).toBe(5);
  });
});
