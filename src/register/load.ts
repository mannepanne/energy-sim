// ABOUT: Validates an already-parsed register object and reports problems by row id and field
// ABOUT: Does no file I/O, so the same loader runs in tests, scripts and the browser

import type { z } from 'zod';
import { registerSchema, isIsoDate, type Register, type RegisterRow } from './schema.ts';

export class RegisterValidationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The register is invalid:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'RegisterValidationError';
    this.problems = problems;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Names the row by its id when the input has one, and always by its position. */
function describeRow(input: unknown, index: number): string {
  const rows = isRecord(input) ? input.rows : undefined;
  const row: unknown = Array.isArray(rows) ? rows[index] : undefined;
  const id = isRecord(row) ? row.id : undefined;
  return typeof id === 'string' && id !== '' ? `Row "${id}" (rows[${index}])` : `Row rows[${index}]`;
}

/** Turns one Zod issue into "Row "<id>" (rows[i]), field "<field>": <message>". */
export function formatIssue(issue: z.core.$ZodIssue, input: unknown): string {
  const [top, index, ...fieldPath] = issue.path;
  const fields = issue.code === 'unrecognized_keys' ? issue.keys : [fieldPath.map(String).join('.')];
  const field = fields.filter((name) => name !== '').join(', ');
  if (top === 'rows' && typeof index === 'number') {
    const where = describeRow(input, index);
    return field === '' ? `${where}: ${issue.message}` : `${where}, field "${field}": ${issue.message}`;
  }
  const location = issue.path.map(String).join('.');
  return location === '' ? `Register: ${issue.message}` : `Register, field "${location}": ${issue.message}`;
}

/** Validates a parsed register file. Throws a RegisterValidationError listing every problem found. */
export function loadRegister(input: unknown): Register {
  const result = registerSchema.safeParse(input);
  if (!result.success) throw new RegisterValidationError(result.error.issues.map((issue) => formatIssue(issue, input)));
  return result.data;
}

const CADENCE_MONTHS = { quarterly: 3, yearly: 12 } as const;

export interface StaleRow {
  id: string;
  lastChecked: string;
  dueBy: string;
}

/** The date a row is next due for a check, or undefined for a static row. */
export function dueDate(row: Pick<RegisterRow, 'lastChecked' | 'refreshCadence'>): string | undefined {
  if (row.refreshCadence === 'static') return undefined;
  const months = typeof row.refreshCadence === 'number' ? row.refreshCadence : CADENCE_MONTHS[row.refreshCadence];
  const year = Number(row.lastChecked.slice(0, 4));
  const month = Number(row.lastChecked.slice(5, 7));
  const day = Number(row.lastChecked.slice(8, 10));
  // Clamp to the last day of the target month, so 31 January plus one month is 28 or 29 February.
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * Rows past their refresh cadence on `asOf` (YYYY-MM-DD). Being stale is a warning, not an error.
 * The caller passes the date, so results never depend on the clock.
 */
export function staleRows(register: Register, asOf: string): StaleRow[] {
  if (!isIsoDate(asOf)) throw new Error(`asOf must be a valid ISO date (YYYY-MM-DD), got "${asOf}"`);
  return register.rows.flatMap((row) => {
    const dueBy = dueDate(row);
    return dueBy !== undefined && asOf > dueBy ? [{ id: row.id, lastChecked: row.lastChecked, dueBy }] : [];
  });
}
