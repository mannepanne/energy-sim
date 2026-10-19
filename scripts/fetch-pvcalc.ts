// ABOUT: Build-time fetch of PVGIS PVcalc for the pre-registered reference system; writes data/snapshots/pvgis-pvcalc-london.json
// ABOUT: Run with `npm run fetch:pvcalc`, or pass a saved response file to trim it without a network call

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { pvcalcRequestUrl } from './pvgis/pvcalcCheck.ts';
import { serialisePvcalcSnapshot, trimPvcalcResponse } from './pvgis/pvcalc.ts';

const OUTPUT = new URL('../data/snapshots/pvgis-pvcalc-london.json', import.meta.url);
/** The response is about 5 KB; anything far larger is not a PVcalc answer. */
const MAX_RESPONSE_BYTES = 1_000_000;
const [savedResponse, savedOn] = process.argv.slice(2);

const requestUrl = pvcalcRequestUrl();
let body: string;
// With a saved response, the recorded SHA-256 shows the snapshot came from that file, not that the file came from
// PVGIS: keep the saved file's own provenance (who fetched it, when) in the PR that commits it.
if (savedResponse) {
  if (!savedOn) throw new Error('With a saved response, also pass the date it was fetched (YYYY-MM-DD)');
  body = readFileSync(savedResponse, 'utf8');
} else {
  const response = await fetch(requestUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`PVGIS returned ${response.status} ${response.statusText} for ${requestUrl}`);
  body = await response.text();
}
if (body.length > MAX_RESPONSE_BYTES) throw new Error(`The PVcalc response is ${body.length} characters, far more than expected`);

const snapshot = trimPvcalcResponse(JSON.parse(body) as unknown, {
  requestUrl,
  fetchedOn: savedOn ?? new Date().toISOString().slice(0, 10),
  responseSha256: createHash('sha256').update(body).digest('hex'),
});
await writeFile(OUTPUT, serialisePvcalcSnapshot(snapshot));
console.log(`Wrote ${OUTPUT.pathname}: ${snapshot.annualKwh} kWh a year for ${snapshot.system.peakPowerKw} kWp`);
