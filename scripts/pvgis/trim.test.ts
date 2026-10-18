// ABOUT: Tests for trimming a PVGIS TMY response into the snapshot shape and serialising it
// ABOUT: Rebuilds a response from the committed snapshot, so no network access is needed

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { serialiseSnapshot, tmyRequestUrl, trimTmyResponse } from './trim.ts';

const raw = readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8');
const snapshot = loadPvgisSnapshot(JSON.parse(raw) as unknown);

/** A PVGIS-shaped response carrying the snapshot's data, plus columns the trim drops. */
interface TestResponse {
  inputs: unknown;
  outputs: { months_selected: unknown[]; tmy_hourly: Record<string, string | number | undefined>[] };
}

function responseFromSnapshot(): TestResponse {
  const { hours } = snapshot;
  return {
    inputs: {
      location: { latitude: 51.507, longitude: -0.128, elevation: 19 },
      meteo_data: { radiation_db: snapshot.radiationDatabase, meteo_db: 'ERA5' },
    },
    outputs: {
      months_selected: snapshot.monthsSelected.map((month) => ({ ...month, extra: 1 })),
      tmy_hourly: hours['time(UTC)'].map((time, index) => ({
        'time(UTC)': time,
        T2m: hours.T2m[index],
        RH: 80,
        'G(h)': hours['G(h)'][index],
        'Gb(n)': hours['Gb(n)'][index],
        'Gd(h)': hours['Gd(h)'][index],
        WS10m: 3,
      })),
    },
  };
}

const details = {
  requestUrl: snapshot.requestUrl,
  fetchedOn: snapshot.fetchedOn,
  responseSha256: snapshot.responseSha256,
};

describe('trimTmyResponse', () => {
  it('rebuilds the committed snapshot from an equivalent response', () => {
    expect(trimTmyResponse(responseFromSnapshot(), details)).toEqual(snapshot);
  });

  it('rejects a response missing a needed column', () => {
    const response = responseFromSnapshot();
    delete response.outputs.tmy_hourly[5]!['Gd(h)'];
    expect(() => trimTmyResponse(response, details)).toThrow(/Gd\(h\)/);
  });

  it('rejects a response that is not a typical year', () => {
    const response = responseFromSnapshot();
    response.outputs.tmy_hourly.pop();
    expect(() => trimTmyResponse(response, details)).toThrow(/8760 hours/);
  });
});

describe('serialiseSnapshot', () => {
  it('produces the committed file byte for byte, with one line per column', () => {
    const text = serialiseSnapshot(snapshot);
    expect(text).toBe(raw);
    expect(JSON.parse(text)).toEqual(snapshot);
  });
});

describe('tmyRequestUrl', () => {
  it('builds the v5.3 JSON request for a location', () => {
    expect(tmyRequestUrl(51.507, -0.128)).toBe('https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=51.507&lon=-0.128&outputformat=json');
  });
});
