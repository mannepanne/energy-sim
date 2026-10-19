// ABOUT: Turns a raw PVGIS PVcalc response into the committed check snapshot, and validates that snapshot
// ABOUT: Keeps the annual and monthly yield and in-plane irradiance and PVGIS's loss breakdown, with provenance

import { z } from 'zod';
import { httpsUrlSchema, isoDateSchema } from '../../src/register/schema.ts';
import { PVGIS_ATTRIBUTION, type FetchDetails } from './trim.ts';

const MONTHS = 12;

/** PVcalc reports some losses as strings, such as "1.92". */
const numeric = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);

const pvcalcResponseSchema = z.object({
  inputs: z.object({
    location: z.object({ latitude: z.number(), longitude: z.number() }),
    meteo_data: z.object({ radiation_db: z.string(), year_min: z.number(), year_max: z.number(), use_horizon: z.boolean() }),
    mounting_system: z.object({ fixed: z.object({ slope: z.object({ value: z.number() }), azimuth: z.object({ value: z.number() }), type: z.string() }) }),
    pv_module: z.object({ technology: z.string(), peak_power: z.number(), system_loss: z.number() }),
  }),
  outputs: z.object({
    monthly: z.object({ fixed: z.array(z.object({ month: z.number(), E_m: z.number(), 'H(i)_m': z.number() })).length(MONTHS) }),
    totals: z.object({
      fixed: z.object({ E_y: z.number(), 'H(i)_y': z.number(), l_aoi: numeric, l_spec: numeric, l_tg: numeric, l_total: numeric }),
    }),
  }),
});

const monthlySchema = z.array(z.number()).length(MONTHS);

export const pvcalcSnapshotSchema = z.strictObject({
  schema: z.literal('pvgis-pvcalc'),
  attribution: z.string().min(1),
  requestUrl: httpsUrlSchema,
  fetchedOn: isoDateSchema,
  responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  system: z.strictObject({
    latitude: z.number(),
    longitude: z.number(),
    radiationDatabase: z.string(),
    years: z.tuple([z.number(), z.number()]),
    useHorizon: z.boolean(),
    technology: z.string(),
    mounting: z.string(),
    peakPowerKw: z.number().positive(),
    systemLossPercent: z.number(),
    tiltDeg: z.number(),
    aspectDeg: z.number(),
  }),
  /** AC yield, kWh, per year and per month. */
  annualKwh: z.number().positive(),
  monthlyKwh: monthlySchema,
  /** Irradiation on the panel, kWh/m², per year and per month. */
  annualInPlaneKwhPerM2: z.number().positive(),
  monthlyInPlaneKwhPerM2: monthlySchema,
  /** PVGIS's losses, %: reflection (angle of incidence), spectral, temperature and low irradiance, and all together. */
  lossesPercent: z.strictObject({ angleOfIncidence: z.number(), spectral: z.number(), temperatureAndIrradiance: z.number(), total: z.number() }),
});

export type PvcalcSnapshot = z.infer<typeof pvcalcSnapshotSchema>;

export function loadPvcalcSnapshot(parsed: unknown): PvcalcSnapshot {
  return pvcalcSnapshotSchema.parse(parsed);
}

export function trimPvcalcResponse(response: unknown, details: FetchDetails): PvcalcSnapshot {
  const { inputs, outputs } = pvcalcResponseSchema.parse(response);
  const fixed = inputs.mounting_system.fixed;
  const totals = outputs.totals.fixed;
  const months = outputs.monthly.fixed.toSorted((a, b) => a.month - b.month);
  return pvcalcSnapshotSchema.parse({
    schema: 'pvgis-pvcalc',
    attribution: PVGIS_ATTRIBUTION.replace('Trimmed to the columns the engine uses.', 'Trimmed to the totals the PV check uses.'),
    requestUrl: details.requestUrl,
    fetchedOn: details.fetchedOn,
    responseSha256: details.responseSha256,
    system: {
      latitude: inputs.location.latitude,
      longitude: inputs.location.longitude,
      radiationDatabase: inputs.meteo_data.radiation_db,
      years: [inputs.meteo_data.year_min, inputs.meteo_data.year_max],
      useHorizon: inputs.meteo_data.use_horizon,
      technology: inputs.pv_module.technology,
      mounting: fixed.type,
      peakPowerKw: inputs.pv_module.peak_power,
      systemLossPercent: inputs.pv_module.system_loss,
      tiltDeg: fixed.slope.value,
      aspectDeg: fixed.azimuth.value,
    },
    annualKwh: totals.E_y,
    monthlyKwh: months.map((month) => month.E_m),
    annualInPlaneKwhPerM2: totals['H(i)_y'],
    monthlyInPlaneKwhPerM2: months.map((month) => month['H(i)_m']),
    lossesPercent: { angleOfIncidence: totals.l_aoi, spectral: totals.l_spec, temperatureAndIrradiance: totals.l_tg, total: totals.l_total },
  });
}

export const serialisePvcalcSnapshot = (snapshot: PvcalcSnapshot): string => `${JSON.stringify(snapshot, null, 2)}\n`;
