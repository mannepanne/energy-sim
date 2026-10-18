// ABOUT: Typed, throwing accessor over a validated register
// ABOUT: Reads a row by RowId and checks its kind, and a table cell by key; an unknown id or key throws an error naming it

import type { RowId } from './ids.ts';
import type {
  CorrelationRow,
  FixedRow,
  ProfileRow,
  Register,
  RegisterRow,
  SeriesRow,
  TableCell,
  TableRow,
  UncertainRow,
} from './schema.ts';

export interface RegisterAccessor {
  row(id: RowId): RegisterRow;
  uncertain(id: RowId): UncertainRow;
  fixed(id: RowId): FixedRow;
  series(id: RowId): SeriesRow;
  profile(id: RowId): ProfileRow;
  table(id: RowId): TableRow;
  correlation(id: RowId): CorrelationRow;
  /** Every correlation row in the register. */
  correlations(): readonly CorrelationRow[];
  /** One cell of a table row. Throws, naming the row and the key, if the key is missing. */
  cell(id: RowId, key: string): TableCell;
  /** A fixed number cell. Throws if the cell is missing, uncertain or a string. */
  cellNumber(id: RowId, key: string): number;
  /** A fixed string cell (a categorical fact). Throws if the cell is missing, uncertain or a number. */
  cellString(id: RowId, key: string): string;
}

function isKind<Kind extends RegisterRow['kind']>(row: RegisterRow, kind: Kind): row is Extract<RegisterRow, { kind: Kind }> {
  return row.kind === kind;
}

export function createAccessor(register: Register): RegisterAccessor {
  const rows = new Map(register.rows.map((row) => [row.id, row]));
  const cellMaps = new Map<string, Map<string, TableCell>>();
  for (const row of register.rows) {
    if (row.kind === 'table') cellMaps.set(row.id, new Map(row.cells.map((cell) => [cell.key, cell])));
  }
  const correlationRows = register.rows.filter((row): row is CorrelationRow => row.kind === 'correlation');

  const row = (id: RowId): RegisterRow => {
    const found = rows.get(id);
    if (!found) throw new Error(`Register has no row with id "${id}"`);
    return found;
  };

  const ofKind =
    <Kind extends RegisterRow['kind']>(kind: Kind) =>
    (id: RowId): Extract<RegisterRow, { kind: Kind }> => {
      const found = row(id);
      if (!isKind(found, kind)) throw new Error(`Register row "${id}" has kind "${found.kind}", not "${kind}"`);
      return found;
    };

  const table = ofKind('table');

  const cell = (id: RowId, key: string): TableCell => {
    table(id);
    const found = cellMaps.get(id)?.get(key);
    if (!found) throw new Error(`Register row "${id}" has no cell with key "${key}"`);
    return found;
  };

  const fixedValue = (id: RowId, key: string): number | string => {
    const found = cell(id, key);
    if ('distribution' in found) throw new Error(`Register row "${id}", key "${key}" is an uncertain cell, not a fixed one`);
    return found.value;
  };

  return {
    row,
    uncertain: ofKind('uncertain'),
    fixed: ofKind('fixed'),
    series: ofKind('series'),
    profile: ofKind('profile'),
    table,
    correlation: ofKind('correlation'),
    correlations: () => correlationRows,
    cell,
    cellNumber: (id, key) => {
      const value = fixedValue(id, key);
      if (typeof value !== 'number') throw new Error(`Register row "${id}", key "${key}" holds text ("${value}"), not a number`);
      return value;
    },
    cellString: (id, key) => {
      const value = fixedValue(id, key);
      if (typeof value !== 'string') throw new Error(`Register row "${id}", key "${key}" holds a number (${value}), not text`);
      return value;
    },
  };
}
