// ABOUT: Zod schemas for the parameter register: four row kinds, provenance rules and integrity checks
// ABOUT: Row-level checks run per row; cross-row checks (unique ids, dependencies) run on the whole file

import { z } from 'zod';

export const SECTIONS = [
  'weather',
  'geometry',
  'fabric',
  'gains',
  'heating',
  'hotWater',
  'prices',
  'carbon',
  'electricity',
] as const;

export const STATUSES = ['sourced', 'to-verify', 'approximate'] as const;

/** Snapshot schemas a `series` row may name. Each has a validator in src/snapshots/. */
export const SNAPSHOT_SCHEMAS = ['pvgis-tmy'] as const;

/** Profile resolutions and the number of values each needs. */
export const PROFILE_RESOLUTIONS = ['hour-of-day', 'month'] as const;
export const PROFILE_LENGTHS: Record<(typeof PROFILE_RESOLUTIONS)[number], number> = { 'hour-of-day': 24, month: 12 };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD (so 2026-02-30 is rejected). */
export function isIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isoDateSchema = z.string().refine(isIsoDate, { message: 'must be a valid ISO date (YYYY-MM-DD)' });

/** Only https links, since the site will render sources as links. */
export const httpsUrlSchema = z.url({ protocol: /^https$/ });

export const sourceSchema = z.strictObject({
  title: z.string().min(1),
  url: httpsUrlSchema,
});

const refreshCadenceSchema = z.union([z.enum(['quarterly', 'yearly', 'static']), z.number().int().positive()]);

const baseFields = {
  id: z.string().min(1),
  section: z.enum(SECTIONS),
  label: z.string().min(1),
  unit: z.string().min(1),
  status: z.enum(STATUSES),
  source: sourceSchema.optional(),
  rationale: z.string().min(1).optional(),
  lastChecked: isoDateSchema,
  refreshCadence: refreshCadenceSchema,
  overridable: z.boolean(),
  overrideHint: z.string().min(1).nullable(),
  dependsOn: z.array(z.string().min(1)),
};

const uncertainRowSchema = z.strictObject({
  ...baseFields,
  kind: z.literal('uncertain'),
  default: z.number(),
  low: z.number(),
  high: z.number(),
  distribution: z.enum(['triangular', 'lognormal']),
  median: z.number().optional(),
  sigma: z.number().optional(),
});

const fixedRowSchema = z.strictObject({
  ...baseFields,
  kind: z.literal('fixed'),
  value: z.number(),
});

const seriesRowSchema = z.strictObject({
  ...baseFields,
  kind: z.literal('series'),
  file: z.string().regex(/^data\/snapshots\/[a-z0-9-]+\.json$/, { message: 'must be a file in data/snapshots/, such as data/snapshots/name.json' }),
  schema: z.enum(SNAPSHOT_SCHEMAS),
  columns: z.array(z.string().min(1)).min(1),
});

const profileRowSchema = z.strictObject({
  ...baseFields,
  kind: z.literal('profile'),
  values: z.array(z.number()).min(1),
  resolution: z.enum(PROFILE_RESOLUTIONS),
});

type Issue = { field: string; message: string };

/** Provenance: sourced and to-verify rows need a source; approximate rows need a rationale. */
function provenanceIssues(row: { status: (typeof STATUSES)[number]; source?: unknown; rationale?: unknown }): Issue[] {
  if (row.status === 'approximate') {
    return row.rationale === undefined ? [{ field: 'rationale', message: 'is required for an approximate row' }] : [];
  }
  return row.source === undefined ? [{ field: 'source', message: `is required for a ${row.status} row` }] : [];
}

function uncertainIssues(row: z.infer<typeof uncertainRowSchema>): Issue[] {
  const issues: Issue[] = [];
  if (row.low > row.high) issues.push({ field: 'low', message: `(${row.low}) must not be above high (${row.high})` });
  if (row.default < row.low || row.default > row.high) {
    issues.push({ field: 'default', message: `(${row.default}) must lie within low–high (${row.low}–${row.high})` });
  }
  if (row.distribution === 'lognormal') {
    if (row.median === undefined) issues.push({ field: 'median', message: 'is required for a lognormal row' });
    else if (row.median !== row.default) {
      issues.push({ field: 'default', message: `(${row.default}) must equal median (${row.median}) for a lognormal row` });
    }
    if (row.sigma === undefined) issues.push({ field: 'sigma', message: 'is required for a lognormal row' });
    else if (row.sigma <= 0) issues.push({ field: 'sigma', message: `(${row.sigma}) must be positive` });
  } else {
    if (row.median !== undefined) issues.push({ field: 'median', message: 'is only allowed on a lognormal row' });
    if (row.sigma !== undefined) issues.push({ field: 'sigma', message: 'is only allowed on a lognormal row' });
  }
  return issues;
}

function profileIssues(row: z.infer<typeof profileRowSchema>): Issue[] {
  const expected = PROFILE_LENGTHS[row.resolution];
  return row.values.length === expected
    ? []
    : [{ field: 'values', message: `has ${row.values.length} values; resolution "${row.resolution}" needs ${expected}` }];
}

export const registerRowSchema = z
  .discriminatedUnion('kind', [uncertainRowSchema, fixedRowSchema, seriesRowSchema, profileRowSchema])
  .superRefine((row, ctx) => {
    const issues = [...provenanceIssues(row)];
    const prefix = row.id.split('.')[0];
    if (prefix !== row.section) issues.push({ field: 'id', message: `must start with its section ("${row.section}.")` });
    if (row.kind === 'uncertain') issues.push(...uncertainIssues(row));
    if (row.kind === 'profile') issues.push(...profileIssues(row));
    for (const issue of issues) ctx.addIssue({ code: 'custom', path: [issue.field], message: issue.message });
  });

/** Finds one dependency cycle, returned as the ids along it with the first id repeated at the end. */
export function findCycle(dependencies: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  const done = new Set<string>();
  const onPath: string[] = [];
  const visit = (id: string): string[] | undefined => {
    const index = onPath.indexOf(id);
    if (index !== -1) return [...onPath.slice(index), id];
    if (done.has(id)) return undefined;
    onPath.push(id);
    for (const next of dependencies.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    onPath.pop();
    done.add(id);
    return undefined;
  };
  for (const id of dependencies.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return undefined;
}

export const registerSchema = z
  .strictObject({
    rows: z.array(registerRowSchema),
  })
  .superRefine((register, ctx) => {
    const firstIndex = new Map<string, number>();
    register.rows.forEach((row, index) => {
      const earlier = firstIndex.get(row.id);
      if (earlier === undefined) firstIndex.set(row.id, index);
      else ctx.addIssue({ code: 'custom', path: ['rows', index, 'id'], message: `duplicates the id of rows[${earlier}]` });
    });

    register.rows.forEach((row, index) => {
      row.dependsOn.forEach((dependency, position) => {
        if (!firstIndex.has(dependency)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rows', index, 'dependsOn', position],
            message: `names a missing row "${dependency}"`,
          });
        }
      });
    });

    const cycle = findCycle(new Map(register.rows.map((row) => [row.id, row.dependsOn])));
    if (cycle) {
      const index = firstIndex.get(cycle[0]!)!;
      ctx.addIssue({ code: 'custom', path: ['rows', index, 'dependsOn'], message: `forms a cycle: ${cycle.join(' → ')}` });
    }
  });

export type RegisterRow = z.infer<typeof registerRowSchema>;
export type UncertainRow = Extract<RegisterRow, { kind: 'uncertain' }>;
export type FixedRow = Extract<RegisterRow, { kind: 'fixed' }>;
export type SeriesRow = Extract<RegisterRow, { kind: 'series' }>;
export type ProfileRow = Extract<RegisterRow, { kind: 'profile' }>;
export type Register = z.infer<typeof registerSchema>;
