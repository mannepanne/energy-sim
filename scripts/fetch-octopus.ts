// ABOUT: Build-time fetch of Octopus's London tariffs (Cosy, Agile, Outgoing Octopus and the fixed export tariff)
// ABOUT: Run with `npm run fetch:octopus`; writes data/snapshots/octopus-london.json after validating it

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  agileImportProducts,
  agileWindow,
  buildSnapshot,
  checkNextPage,
  COSY_PRODUCT,
  FIXED_SEG_PRODUCT,
  OUTGOING_PRODUCT,
  productsAvailableAtUrl,
  ratePageSchema,
  ratesUrl,
  serialiseOctopusSnapshot,
  type Rate,
} from './octopus/build.ts';

const OUTPUT = new URL('../data/snapshots/octopus-london.json', import.meta.url);
/** Agile is 12 pages of 1,500; anything far more means the paging has gone wrong. */
const MAX_PAGES = 30;
const DAY_MS = 86_400_000;

const requestUrls: string[] = [];
const hash = createHash('sha256');

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Octopus returned ${response.status} ${response.statusText} for ${url}`);
  const body = await response.text();
  requestUrls.push(url);
  hash.update(body);
  return JSON.parse(body) as unknown;
}

/** Every rate from a paginated list, following `next` links. */
async function allRates(url: string): Promise<Rate[]> {
  const rates: Rate[] = [];
  let next: string | null = url;
  for (let page = 0; next !== null; page += 1) {
    if (page === MAX_PAGES) throw new Error(`More than ${MAX_PAGES} pages from ${url}`);
    const parsed = ratePageSchema.parse(await getJson(next));
    rates.push(...parsed.results);
    next = parsed.next === null ? null : checkNextPage(parsed.next);
  }
  return rates;
}

const fetchedOn = new Date().toISOString().slice(0, 10);
const window = agileWindow(fetchedOn);

// The window must be covered by one Agile product; the build refuses to join two.
const lastHalfHour = new Date(Date.parse(window.end) - 1_800_000).toISOString();
const products = new Set([
  ...agileImportProducts(await getJson(productsAvailableAtUrl(window.start))),
  ...agileImportProducts(await getJson(productsAvailableAtUrl(lastHalfHour))),
]);
if (products.size !== 1) throw new Error(`Expected one Agile product over the window, found: ${[...products].join(', ') || 'none'}`);
const agileProduct = [...products][0]!;

const cosyFrom = new Date(Date.parse(fetchedOn) - 7 * DAY_MS).toISOString();
const responses = {
  agileRates: await allRates(ratesUrl(agileProduct, 'standard-unit-rates', { from: window.start, to: window.end })),
  agileStanding: await allRates(ratesUrl(agileProduct, 'standing-charges')),
  cosyRates: await allRates(ratesUrl(COSY_PRODUCT, 'standard-unit-rates', { from: cosyFrom, to: new Date(Date.parse(fetchedOn) + 2 * DAY_MS).toISOString() })),
  cosyStanding: await allRates(ratesUrl(COSY_PRODUCT, 'standing-charges')),
  outgoingRates: await allRates(ratesUrl(OUTGOING_PRODUCT, 'standard-unit-rates')),
  fixedSegRates: await allRates(ratesUrl(FIXED_SEG_PRODUCT, 'standard-unit-rates')),
};

const snapshot = buildSnapshot({ ...responses, fetchedOn, requestUrls, responsesSha256: hash.digest('hex'), agileProduct, window });
await writeFile(OUTPUT, serialiseOctopusSnapshot(snapshot));

const agile = snapshot.agile.halfHourlyIncVatPence;
const mean = agile.reduce((total, value) => total + value, 0) / agile.length;
console.log(`Wrote ${OUTPUT.pathname}`);
console.log(`Agile ${agileProduct}, ${window.start} to ${window.end}: mean ${mean.toFixed(2)}p inc VAT, ${agile.filter((value) => value < 0).length} negative half-hours`);
console.log(`Cosy on ${snapshot.cosy.day}: ${[...new Set(snapshot.cosy.unitRatesIncVatPence)].join(', ')}p; standing ${snapshot.cosy.standingChargeIncVatPencePerDay}p a day`);
console.log(`Outgoing Octopus ${snapshot.export.outgoing.ratePence}p (before: ${snapshot.export.outgoing.previousRatePence}p); fixed export ${snapshot.export.fixedSeg.ratePence}p`);
