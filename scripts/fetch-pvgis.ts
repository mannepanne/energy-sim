// ABOUT: Build-time fetch of the PVGIS typical year for London; writes data/snapshots/pvgis-tmy-london.json
// ABOUT: Run with `npm run fetch:pvgis`; the response is validated before anything is written

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { serialiseSnapshot, tmyRequestUrl, trimTmyResponse } from './pvgis/trim.ts';

const LATITUDE = 51.507;
const LONGITUDE = -0.128;
const OUTPUT = new URL('../data/snapshots/pvgis-tmy-london.json', import.meta.url);

const requestUrl = tmyRequestUrl(LATITUDE, LONGITUDE);
const response = await fetch(requestUrl);
if (!response.ok) throw new Error(`PVGIS returned ${response.status} ${response.statusText} for ${requestUrl}`);
const body = await response.text();

const snapshot = trimTmyResponse(JSON.parse(body) as unknown, {
  requestUrl,
  fetchedOn: new Date().toISOString().slice(0, 10),
  responseSha256: createHash('sha256').update(body).digest('hex'),
});
await writeFile(OUTPUT, serialiseSnapshot(snapshot));

const meanTemperature = snapshot.hours.T2m.reduce((sum, value) => sum + value, 0) / snapshot.hours.T2m.length;
console.log(`Wrote ${OUTPUT.pathname}: mean T2m ${meanTemperature.toFixed(2)} °C, radiation ${snapshot.radiationDatabase}`);
