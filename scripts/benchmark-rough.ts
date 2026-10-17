// ABOUT: Command-line entry for benchmark step 1: prints the rough heat-demand results tables
// ABOUT: Run with `npm run benchmark:rough`; a test checks the README contains this exact output

import { resultsMarkdown } from './benchmark/roughEstimate.ts';

console.log(resultsMarkdown());
