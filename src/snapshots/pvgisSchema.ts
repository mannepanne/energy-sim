// ABOUT: Zod schema for the committed PVGIS typical-year snapshot (column arrays of 8,760 UTC hours)
// ABOUT: Rejects a missing column, the wrong row count, out-of-order hours and a leap day, with clear messages

import { z } from 'zod';
import { httpsUrlSchema, isoDateSchema, sourceSchema } from '../register/schema.ts';

export const HOURS_PER_TYPICAL_YEAR = 8760;

/** The columns the engine uses: air temperature (°C) and global horizontal, beam normal and diffuse horizontal irradiance (W/m²). */
export const PVGIS_COLUMNS = ['T2m', 'G(h)', 'Gb(n)', 'Gd(h)'] as const;
export type PvgisColumn = (typeof PVGIS_COLUMNS)[number];

/** PVGIS timestamps, such as "20070101:0000": the source year, month, day, hour and minute, in UTC. */
const PVGIS_TIME = /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/;

/** Month, day and hour (UTC) for hour `index` of a non-leap year, as "MM-DD HH". */
const pad = (value: number): string => String(value).padStart(2, '0');

function expectedHour(index: number): string {
  const date = new Date(Date.UTC(2001, 0, 1) + index * 3_600_000);
  return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}`;
}

/**
 * Checks that the timestamps run hour by hour from 1 January 00:00 to 31 December 23:00 with no leap day.
 * Each month of a typical year comes from a different source year, so only month, day and hour are compared.
 * Returns the first problem found, or undefined.
 */
export function timestampProblem(times: readonly string[]): string | undefined {
  for (const [index, time] of times.entries()) {
    const match = PVGIS_TIME.exec(time);
    if (!match) return `hour ${index}: "${time}" is not a PVGIS timestamp (YYYYMMDD:HHMM)`;
    const [, , month, day, hour, minute] = match;
    if (month === '02' && day === '29') return `hour ${index}: "${time}" is a leap day, which a typical year must not contain`;
    const found = `${month}-${day} ${hour}`;
    if (found !== expectedHour(index) || minute !== '00') {
      return `hour ${index}: "${time}" is out of order; expected month-day hour ${expectedHour(index)}:00 UTC`;
    }
  }
  return undefined;
}

const hourlyColumn = (name: string, minimum?: number) => {
  const value = minimum === undefined ? z.number() : z.number().min(minimum);
  return z
    .array(value)
    .length(HOURS_PER_TYPICAL_YEAR, { message: `column "${name}" must have exactly ${HOURS_PER_TYPICAL_YEAR} hours` });
};

export const pvgisSnapshotSchema = z.strictObject({
  schema: z.literal('pvgis-tmy'),
  source: sourceSchema,
  attribution: z.string().min(1),
  requestUrl: httpsUrlSchema,
  fetchedOn: isoDateSchema,
  responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  location: z.strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    elevationM: z.number(),
  }),
  radiationDatabase: z.string().min(1),
  monthsSelected: z
    .array(z.strictObject({ month: z.number().int().min(1).max(12), year: z.number().int() }))
    .length(12),
  timezone: z.literal('UTC'),
  hours: z.strictObject({
    'time(UTC)': z
      .array(z.string())
      .length(HOURS_PER_TYPICAL_YEAR, { message: `column "time(UTC)" must have exactly ${HOURS_PER_TYPICAL_YEAR} hours` })
      .superRefine((times, ctx) => {
        const problem = timestampProblem(times);
        if (problem) ctx.addIssue({ code: 'custom', message: problem });
      }),
    T2m: hourlyColumn('T2m'),
    'G(h)': hourlyColumn('G(h)', 0),
    'Gb(n)': hourlyColumn('Gb(n)', 0),
    'Gd(h)': hourlyColumn('Gd(h)', 0),
  }),
});

export type PvgisSnapshot = z.infer<typeof pvgisSnapshotSchema>;

/** Validates a parsed snapshot. Throws an error listing each problem with the field it concerns. */
export function loadPvgisSnapshot(input: unknown): PvgisSnapshot {
  const result = pvgisSnapshotSchema.safeParse(input);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const field = issue.path.map(String).join('.');
    const message = issue.code === 'unrecognized_keys' ? `unexpected field(s) ${issue.keys.join(', ')}` : issue.message;
    return field === '' ? `- ${message}` : `- field "${field}": ${message}`;
  });
  throw new Error(`The PVGIS snapshot is invalid:\n${problems.join('\n')}`);
}
