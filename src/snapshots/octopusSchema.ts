// ABOUT: Zod schema for the committed Octopus snapshot for London (region C): Cosy, Agile and the export tariffs
// ABOUT: Agile is 17,520 half-hours on the typical year (UTC), from one past 12-month window; rates are in pence

import { z } from 'zod';
import { httpsUrlSchema, isoDateSchema } from '../register/schema.ts';

export const HALF_HOURS_PER_TYPICAL_YEAR = 17_520;
export const HOURS_PER_DAY_PROFILE = 24;

/** An instant as the API gives it, such as "2026-10-21T21:00:00Z". */
const instantSchema = z.iso.datetime({ offset: true });

/**
 * A broad bound on any unit rate, p/kWh, to catch a corrupted fetch. The snapshot's Agile rates run from about −11p to 87p,
 * and negative prices are real, so the bound is wide.
 */
export const RATE_BOUNDS_PENCE = { low: -100, high: 500 } as const;
const RATE_BOUNDS_MESSAGE = `must be from ${RATE_BOUNDS_PENCE.low} to ${RATE_BOUNDS_PENCE.high} p/kWh`;
const rateSchema = z.number().min(RATE_BOUNDS_PENCE.low, { message: RATE_BOUNDS_MESSAGE }).max(RATE_BOUNDS_PENCE.high, { message: RATE_BOUNDS_MESSAGE });

const halfHourlyColumn = (name: string) =>
  z.array(rateSchema).length(HALF_HOURS_PER_TYPICAL_YEAR, { message: `column "${name}" must have exactly ${HALF_HOURS_PER_TYPICAL_YEAR} half-hours` });

const dayProfile = z.array(rateSchema).length(HOURS_PER_DAY_PROFILE);

const tariffIdentity = {
  productCode: z.string().min(1),
  tariffCode: z.string().min(1),
};

export const octopusSnapshotSchema = z.strictObject({
  schema: z.literal('octopus-london'),
  attribution: z.string().min(1),
  /** The Octopus region letter: C is London. */
  region: z.literal('C'),
  fetchedOn: isoDateSchema,
  /** Every request the snapshot was built from, in order, and the SHA-256 of their response bodies joined in that order. */
  requestUrls: z.array(httpsUrlSchema).min(1),
  responsesSha256: z.string().regex(/^[0-9a-f]{64}$/),
  cosy: z.strictObject({
    ...tariffIdentity,
    /** The UK local day the hourly rates were read from. */
    day: isoDateSchema,
    /** Unit rate by UK local hour of day, 00:00 first. */
    unitRatesIncVatPence: dayProfile,
    unitRatesExcVatPence: dayProfile,
    standingChargeIncVatPencePerDay: z.number().positive(),
    standingChargeExcVatPencePerDay: z.number().positive(),
    /** When the standing charge in force on `day` took effect. */
    standingChargeValidFrom: instantSchema,
  }),
  agile: z.strictObject({
    ...tariffIdentity,
    /** The 12 months used: start inclusive, end exclusive, UTC. */
    windowStart: instantSchema,
    windowEnd: instantSchema,
    /** Typical-year half-hours (UTC, 1 January 00:00 first), each the rate on the same calendar date and time in the window. */
    halfHourlyIncVatPence: halfHourlyColumn('halfHourlyIncVatPence'),
    halfHourlyExcVatPence: halfHourlyColumn('halfHourlyExcVatPence'),
    standingChargeIncVatPencePerDay: z.number().positive(),
    standingChargeExcVatPencePerDay: z.number().positive(),
  }),
  export: z.strictObject({
    /** Outgoing Octopus: the flat export tariff. */
    outgoing: z.strictObject({
      ...tariffIdentity,
      ratePence: z.number().positive(),
      validFrom: instantSchema,
      /** The rate before the current one, which the export row's high end uses. */
      previousRatePence: z.number().positive(),
      previousValidFrom: instantSchema,
    }),
    /** Octopus's fixed Smart Export Guarantee tariff. */
    fixedSeg: z.strictObject({
      ...tariffIdentity,
      ratePence: z.number().positive(),
      validFrom: instantSchema,
    }),
  }),
});

export type OctopusSnapshot = z.infer<typeof octopusSnapshotSchema>;

/** Validates a parsed snapshot. Throws an error listing each problem with the field it concerns. */
export function loadOctopusSnapshot(input: unknown): OctopusSnapshot {
  const result = octopusSnapshotSchema.safeParse(input);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const field = issue.path.map(String).join('.');
    const message = issue.code === 'unrecognized_keys' ? `unexpected field(s) ${issue.keys.join(', ')}` : issue.message;
    return field === '' ? `- ${message}` : `- field "${field}": ${message}`;
  });
  throw new Error(`The Octopus snapshot is invalid:\n${problems.join('\n')}`);
}
