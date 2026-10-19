// ABOUT: Turns a raw PVGIS typical-year (TMY) API response into the committed snapshot shape
// ABOUT: Keeps PVGIS's hour order, trims to the engine's columns, adds attribution, then validates

import { z } from 'zod';
import { PVGIS_COLUMNS, pvgisSnapshotSchema, type PvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';

export const PVGIS_API_VERSION = 'v5_3';

export const PVGIS_SOURCE = {
  title: 'PVGIS v5.3 typical meteorological year (European Commission Joint Research Centre)',
  url: 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en',
};

/** PVGIS's reuse notice, shared by every PVGIS snapshot. */
export const PVGIS_REUSE_NOTICE =
  'Source: PVGIS © European Union, 2001–2026. Reuse is authorised provided the source is acknowledged (Commission Decision 2011/833/EU).';

export const PVGIS_ATTRIBUTION = `${PVGIS_REUSE_NOTICE} Trimmed to the columns the engine uses.`;

export function tmyRequestUrl(latitude: number, longitude: number): string {
  return `https://re.jrc.ec.europa.eu/api/${PVGIS_API_VERSION}/tmy?lat=${latitude}&lon=${longitude}&outputformat=json`;
}

/** The parts of the PVGIS TMY response the snapshot uses. Other fields are ignored. */
const tmyResponseSchema = z.object({
  inputs: z.object({
    location: z.object({ latitude: z.number(), longitude: z.number(), elevation: z.number() }),
    meteo_data: z.object({ radiation_db: z.string() }),
  }),
  outputs: z.object({
    months_selected: z.array(z.object({ month: z.number(), year: z.number() })),
    tmy_hourly: z.array(
      z.object({
        'time(UTC)': z.string(),
        T2m: z.number(),
        'G(h)': z.number(),
        'Gb(n)': z.number(),
        'Gd(h)': z.number(),
      }),
    ),
  }),
});

export interface FetchDetails {
  requestUrl: string;
  fetchedOn: string;
  responseSha256: string;
}

/** Builds and validates the snapshot. Throws if the response or the result is malformed. */
export function trimTmyResponse(response: unknown, details: FetchDetails): PvgisSnapshot {
  const parsed = tmyResponseSchema.parse(response);
  const hourly = parsed.outputs.tmy_hourly;
  const column = (name: (typeof PVGIS_COLUMNS)[number]): number[] => hourly.map((hour) => hour[name]);
  return pvgisSnapshotSchema.parse({
    schema: 'pvgis-tmy',
    source: PVGIS_SOURCE,
    attribution: PVGIS_ATTRIBUTION,
    requestUrl: details.requestUrl,
    fetchedOn: details.fetchedOn,
    responseSha256: details.responseSha256,
    location: {
      latitude: parsed.inputs.location.latitude,
      longitude: parsed.inputs.location.longitude,
      elevationM: parsed.inputs.location.elevation,
    },
    radiationDatabase: parsed.inputs.meteo_data.radiation_db,
    monthsSelected: parsed.outputs.months_selected.map(({ month, year }) => ({ month, year })),
    timezone: 'UTC',
    hours: {
      'time(UTC)': hourly.map((hour) => hour['time(UTC)']),
      ...Object.fromEntries(PVGIS_COLUMNS.map((name) => [name, column(name)])),
    },
  });
}

/** Pretty-prints the metadata, with each hourly column on a single line so the file stays small and diffable. */
export function serialiseSnapshot(snapshot: PvgisSnapshot): string {
  const { hours, ...metadata } = snapshot;
  const columnLines = Object.entries(hours).map(([name, values]) => `    ${JSON.stringify(name)}: ${JSON.stringify(values)}`);
  const head = JSON.stringify(metadata, null, 2).replace(/\n}$/, '');
  return `${head},\n  "hours": {\n${columnLines.join(',\n')}\n  }\n}\n`;
}
