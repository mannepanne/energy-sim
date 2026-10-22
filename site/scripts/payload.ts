// ABOUT: Measures the home page's first load from the static export, compressed with gzip and Brotli
// ABOUT: Counts the HTML, the scripts it loads, every other script chunk (the worker's included) and the data files

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const BUDGET_BYTES = 350 * 1024;
const out = process.argv[2] ?? 'out';

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const html = readFileSync(join(out, 'index.html'), 'utf8');
// Scripts marked noModule are only fetched by browsers without module support, which the site doesn't support.
const legacy = new Set([...html.matchAll(/<script[^>]*noModule[^>]*src="([^"]+)"/g)].map((match) => join(out, match[1] ?? '')));
const files = [
  join(out, 'index.html'),
  ...filesUnder(join(out, '_next')).filter((path) => path.endsWith('.js') && !legacy.has(path)),
  ...filesUnder(join(out, 'data')),
];

let gzipTotal = 0;
let brotliTotal = 0;
const rows = files.map((path) => {
  const bytes = readFileSync(path);
  const gzip = gzipSync(bytes, { level: 9 }).length;
  const brotli = brotliCompressSync(bytes).length;
  gzipTotal += gzip;
  brotliTotal += brotli;
  return `${String(bytes.length).padStart(8)} ${String(gzip).padStart(8)} ${String(brotli).padStart(8)}  ${relative(out, path)}`;
});

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
process.stdout.write(`     raw     gzip   brotli  file\n${rows.join('\n')}\n\n`);
process.stdout.write(`First load: ${kb(gzipTotal)} gzip, ${kb(brotliTotal)} Brotli, against a budget of ${kb(BUDGET_BYTES)}\n`);
if (gzipTotal > BUDGET_BYTES) {
  process.stdout.write('Over budget (gzip)\n');
  process.exitCode = 1;
}
