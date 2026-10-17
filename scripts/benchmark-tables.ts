// ABOUT: Command-line entry for benchmark steps 2 and 3: prints the HEM and NEED comparison tables
// ABOUT: Run with `npm run benchmark:tables`; a test checks the README contains this exact output

import { comparisonMarkdown } from './benchmark/comparison.ts';

console.log(comparisonMarkdown());
