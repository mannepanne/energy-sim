// ABOUT: Typed, throwing accessor over a validated register
// ABOUT: Reads a row by RowId and checks its kind; an unknown id or wrong kind throws an error naming the id

import type { RowId } from './ids.ts';
import type { FixedRow, ProfileRow, Register, RegisterRow, SeriesRow, UncertainRow } from './schema.ts';

export interface RegisterAccessor {
  row(id: RowId): RegisterRow;
  uncertain(id: RowId): UncertainRow;
  fixed(id: RowId): FixedRow;
  series(id: RowId): SeriesRow;
  profile(id: RowId): ProfileRow;
}

export function createAccessor(register: Register): RegisterAccessor {
  const rows = new Map(register.rows.map((row) => [row.id, row]));

  const row = (id: RowId): RegisterRow => {
    const found = rows.get(id);
    if (!found) throw new Error(`Register has no row with id "${id}"`);
    return found;
  };

  const ofKind =
    <Kind extends RegisterRow['kind']>(kind: Kind) =>
    (id: RowId): Extract<RegisterRow, { kind: Kind }> => {
      const found = row(id);
      if (found.kind !== kind) throw new Error(`Register row "${id}" is a ${found.kind} row, not a ${kind} row`);
      return found as Extract<RegisterRow, { kind: Kind }>;
    };

  return {
    row,
    uncertain: ofKind('uncertain'),
    fixed: ofKind('fixed'),
    series: ofKind('series'),
    profile: ofKind('profile'),
  };
}
