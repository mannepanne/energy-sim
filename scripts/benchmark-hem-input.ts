// ABOUT: Command-line entry for benchmark step 2: writes one HEM input file per run into scripts/benchmark/hem/
// ABOUT: Run with `npm run benchmark:hem-input`; the README there explains how to run HEM on them

import { writeFileSync } from 'node:fs';
import { HEM_RUNS, hemInputFileContents, SCHEDULED_HEM_RUNS } from './benchmark/hemInput.ts';

for (const run of [...HEM_RUNS, ...SCHEDULED_HEM_RUNS]) {
  const path = new URL(`./benchmark/hem/${run.name}.input.json`, import.meta.url);
  writeFileSync(path, hemInputFileContents(run));
  console.log(`${run.name}: ${run.description}`);
}
