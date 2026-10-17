// ABOUT: Command-line entry for benchmark step 2: writes one HEM input file per run into scripts/benchmark/hem/
// ABOUT: Run with `npm run benchmark:hem-input`; the README there explains how to run HEM on them

import { writeFileSync } from 'node:fs';
import { HEM_RUNS, buildHemInput } from './benchmark/hemInput.ts';

// Number arrays (such as the hourly cold-water temperatures) go on one line to keep the files short.
const formatJson = (value: unknown) =>
  JSON.stringify(value, null, 2).replace(/\[[\d.,\s-]+\]/g, (array) => array.replace(/\s+/g, ''));

for (const run of HEM_RUNS) {
  const path = new URL(`./benchmark/hem/${run.name}.input.json`, import.meta.url);
  writeFileSync(path, `${formatJson(buildHemInput(run.options))}\n`);
  console.log(`${run.name}: ${run.description}`);
}
