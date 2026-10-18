// ABOUT: Tests for the archetypes and quick facts on the real register: table key parity, defaults,
// ABOUT: SAP occupancy, the wall answers each construction offers, and agreement with the NEED pre-registration

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import {
  ARCHETYPE_KEYS,
  archetypeFacts,
  checkHouse,
  defaultHouse,
  defaultOccupants,
  GLAZING_ANSWERS,
  LOFT_ANSWERS,
  sapOccupancy,
  wallAnswers,
} from './archetypes.ts';
import { readInputs } from './inputs.ts';
import { fixtureAccessor } from './testing/fixtureRegister.ts';

const register = loadRegister(JSON.parse(readFileSync(new URL('../../data/register.json', import.meta.url), 'utf8')) as unknown);
const access = createAccessor(register);
const tableKeys = (keyedBy: string): Map<string, string[]> =>
  new Map(register.rows.flatMap((row) => (row.kind === 'table' && row.keyedBy === keyedBy ? [[row.id, row.cells.map((cell) => cell.key)]] : [])));
const bandsUsed = [...new Set(ARCHETYPE_KEYS.map((key) => access.cellString('archetypes.ageBand', key)))].toSorted();

describe('table key parity on the real register', () => {
  it('gives every archetype-keyed row exactly the archetype keys', () => {
    const rows = tableKeys('archetype');
    expect(rows.size).toBeGreaterThanOrEqual(11);
    for (const [id, keys] of rows) expect({ id, keys: keys.toSorted() }).toEqual({ id, keys: [...ARCHETYPE_KEYS].toSorted() });
  });

  it('gives every band-keyed row exactly the bands the archetypes use', () => {
    const rows = tableKeys('age band');
    expect(rows.size).toBeGreaterThanOrEqual(8);
    for (const [id, keys] of rows) expect({ id, keys: keys.toSorted() }).toEqual({ id, keys: bandsUsed });
  });

  it('gives every quick-facts answer a value, and every archetype a wall thickness', () => {
    expect(access.table('fabric.roofUValue').cells.map((cell) => cell.key).toSorted()).toEqual([...LOFT_ANSWERS].toSorted());
    expect(access.table('fabric.windowUValue').cells.map((cell) => cell.key).toSorted()).toEqual([...GLAZING_ANSWERS].toSorted());
    expect(access.table('gains.windowGValue').cells.map((cell) => cell.key).toSorted()).toEqual([...GLAZING_ANSWERS].toSorted());
    for (const archetype of ARCHETYPE_KEYS) {
      const facts = archetypeFacts(access, archetype);
      expect(access.cellNumber('archetypes.wallThickness', `${facts.wallConstruction}/${facts.ageBand}`)).toBeGreaterThan(0);
    }
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
      walls: 'asBuilt',
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
