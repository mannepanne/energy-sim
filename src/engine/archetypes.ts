// ABOUT: The curated house types (archetypes) and the quick-facts answers that adjust them
// ABOUT: A House is an archetype plus floor area, occupants and answers; defaults come from the register

import type { RegisterAccessor } from '../register/access.ts';

/** The archetypes, in the order the spec lists them. Each is keyed to one RdSAP age band. */
export const ARCHETYPE_KEYS = [
  'midTerracePre1900',
  'endTerracePre1900',
  'semi1930s',
  'semi1950s',
  'bungalow1950s',
  'midTerrace1970s',
  'detached1970s',
  'detached1980s',
  'semi2000s',
  'midTerrace2010s',
] as const;
export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

/** The archetype the behaviour rows are calibrated on: phase 1's 1930s semi. */
export const REFERENCE_ARCHETYPE: ArchetypeKey = 'semi1930s';

export const LOFT_ANSWERS = ['none', 'about100mm', '270mmOrMore'] as const;
export type LoftAnswer = (typeof LOFT_ANSWERS)[number];

export const WALL_ANSWERS = ['asBuilt', 'cavityFilled', 'solidWallInsulated'] as const;
export type WallAnswer = (typeof WALL_ANSWERS)[number];

export const GLAZING_ANSWERS = ['single', 'olderDouble', 'newerDouble'] as const;
export type GlazingAnswer = (typeof GLAZING_ANSWERS)[number];

/** The range of the occupants quick fact. */
export const MIN_OCCUPANTS = 1;
export const MAX_OCCUPANTS = 5;

/** The wall constructions the archetypes use. */
export const WALL_CONSTRUCTIONS = ['solidBrick', 'cavity'] as const;
export type WallConstruction = (typeof WALL_CONSTRUCTIONS)[number];

export const GROUND_FLOOR_CONSTRUCTIONS = ['solid', 'suspendedTimber'] as const;
export type GroundFloorConstruction = (typeof GROUND_FLOOR_CONSTRUCTIONS)[number];

export interface House {
  archetype: ArchetypeKey;
  /** Total floor area, m². A fixed input for a run. */
  floorAreaM2: number;
  /** Number of occupants, 1–5. A fixed input for a run. */
  occupants: number;
  loft: LoftAnswer;
  walls: WallAnswer;
  glazing: GlazingAnswer;
}

/** The archetype's facts, read from the register. */
export interface ArchetypeFacts {
  houseType: string;
  ageBand: string;
  storeys: number;
  wallConstruction: WallConstruction;
  defaultFloorAreaM2: number;
  bedrooms: number;
  /** Footprint depth ÷ width. */
  aspectRatio: number;
  partyWalls: number;
}

/** The value if it is one of the options; otherwise throws, naming what was expected. */
export function oneOf<T extends string>(options: readonly T[], value: string, what: string): T {
  const found = options.find((option) => option === value);
  if (found === undefined) throw new Error(`Unknown ${what} "${value}"; expected one of ${options.join(', ')}`);
  return found;
}

export function archetypeFacts(access: RegisterAccessor, archetype: ArchetypeKey): ArchetypeFacts {
  return {
    houseType: access.cellString('archetypes.houseType', archetype),
    ageBand: access.cellString('archetypes.ageBand', archetype),
    storeys: access.cellNumber('archetypes.storeys', archetype),
    wallConstruction: oneOf(WALL_CONSTRUCTIONS, access.cellString('archetypes.wallConstruction', archetype), 'wall construction'),
    defaultFloorAreaM2: access.cellNumber('archetypes.floorArea', archetype),
    bedrooms: access.cellNumber('archetypes.bedrooms', archetype),
    aspectRatio: access.cellNumber('archetypes.aspectRatio', archetype),
    partyWalls: access.cellNumber('archetypes.partyWalls', archetype),
  };
}

/** SAP 10.2 Table 1b: the assumed number of occupants for a floor area, before rounding. */
export function sapOccupancy(access: RegisterAccessor, floorAreaM2: number): number {
  const coefficient = (key: string): number => access.cellNumber('archetypes.occupancy', key);
  const above = floorAreaM2 - coefficient('minimumFloorArea');
  if (above <= 0) return coefficient('base');
  return (
    coefficient('base') + coefficient('saturation') * (1 - Math.exp(-coefficient('curvature') * above * above)) + coefficient('slope') * above
  );
}

/** The default occupant count: SAP's occupancy for the floor area, rounded, within 1–5. */
export function defaultOccupants(access: RegisterAccessor, floorAreaM2: number): number {
  return Math.min(MAX_OCCUPANTS, Math.max(MIN_OCCUPANTS, Math.round(sapOccupancy(access, floorAreaM2))));
}

/** The wall table key for an archetype and an answer. */
export function wallKey(facts: Pick<ArchetypeFacts, 'ageBand' | 'wallConstruction'>, answer: WallAnswer): string {
  return `${facts.ageBand}/${facts.wallConstruction}/${answer}`;
}

/** The wall answers that fit an archetype: those with a U-value for its age band and construction. */
export function wallAnswers(access: RegisterAccessor, archetype: ArchetypeKey): WallAnswer[] {
  const facts = archetypeFacts(access, archetype);
  const keys = new Set(access.table('fabric.wallUValue').cells.map((cell) => cell.key));
  return WALL_ANSWERS.filter((answer) => keys.has(wallKey(facts, answer)));
}

/** The archetype at its default floor area, occupants and quick-facts answers. */
export function defaultHouse(access: RegisterAccessor, archetype: ArchetypeKey): House {
  const floorAreaM2 = access.cellNumber('archetypes.floorArea', archetype);
  return {
    archetype,
    floorAreaM2,
    occupants: defaultOccupants(access, floorAreaM2),
    loft: oneOf(LOFT_ANSWERS, access.cellString('archetypes.defaultLoftAnswer', archetype), 'loft answer'),
    walls: oneOf(WALL_ANSWERS, access.cellString('archetypes.defaultWallAnswer', archetype), 'wall answer'),
    glazing: oneOf(GLAZING_ANSWERS, access.cellString('archetypes.defaultGlazingAnswer', archetype), 'glazing answer'),
  };
}

/** Throws, naming the problem, if a house's inputs are out of range or its wall answer does not fit the archetype. */
export function checkHouse(access: RegisterAccessor, house: House): void {
  if (!(Number.isFinite(house.floorAreaM2) && house.floorAreaM2 > 0)) {
    throw new Error(`Floor area must be a positive number of m², got ${house.floorAreaM2}`);
  }
  if (!Number.isInteger(house.occupants) || house.occupants < MIN_OCCUPANTS || house.occupants > MAX_OCCUPANTS) {
    throw new Error(`Occupants must be a whole number from ${MIN_OCCUPANTS} to ${MAX_OCCUPANTS}, got ${house.occupants}`);
  }
  const answers = wallAnswers(access, house.archetype);
  if (!answers.includes(house.walls)) {
    throw new Error(`Wall answer "${house.walls}" does not fit archetype "${house.archetype}"; it offers ${answers.join(', ')}`);
  }
}
