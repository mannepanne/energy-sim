// ABOUT: Build-time fetch of PVGIS PVcalc for the pre-registered reference system; writes data/snapshots/pvgis-pvcalc-london.json
// ABOUT: Run with `npm run fetch:pvcalc`, or pass a saved response file to trim it without a network call

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { pvcalcRequestUrl } from './pvgis/pvcalcCheck.ts';
import { serialisePvcalcSnapshot, trimPvcalcResponse } from './pvgis/pvcalc.ts';

const OUTPUT = new URL('../data/snapshots/pvgis-pvcalc-london.json', import.meta.url);
const [savedResponse, savedOn] = process.argv.slice(2);

const requestUrl = pvcalcRequestUrl();
let body: string;
if (savedResponse) {
  if (!savedOn) throw new Error('With a saved response, also pass the date it was fetched (YYYY-MM-DD)');
  body = readFileSync(savedResponse, 'utf8');
} else {
  const response = await fetch(requestUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`PVGIS returned ${response.status} ${response.statusText} for ${requestUrl}`);
  body = await response.text();
}

const snapshot = trimPvcalcResponse(JSON.parse(body) as unknown, {
  requestUrl,
  fetchedOn: savedOn ?? new Date().toISOString().slice(0, 10),
  responseSha256: createHash('sha256').update(body).digest('hex'),
});
await writeFile(OUTPUT, serialisePvcalcSnapshot(snapshot));
console.log(`Wrote ${OUTPUT.pathname}: ${snapshot.annualKwh} kWh a year for ${snapshot.system.peakPowerKw} kWp`);
