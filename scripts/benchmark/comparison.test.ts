// ABOUT: Tests for the benchmark steps 2 and 3 comparison tables
// ABOUT: Checks every HEM run has a recorded result, pins the headline gaps, and checks the README is current

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEM_RESULTS, comparisonMarkdown, hemComparisonMarkdown, hemResult, needComparisonMarkdown } from './comparison.ts';
import { HEM_RUNS } from './hemInput.ts';

describe('HEM_RESULTS', () => {
  it('has a recorded result for every HEM run, and none for runs that no longer exist', () => {
    expect(Object.keys(HEM_RESULTS).toSorted()).toEqual(HEM_RUNS.map((run) => run.name).toSorted());
  });

  it('refuses a run with no recorded result', () => {
    expect(() => hemResult({ ...HEM_RUNS[0], name: 'unknown' })).toThrow('No recorded HEM result for run "unknown"');
  });
});

describe('hemComparisonMarkdown', () => {
  it('pins the pre-registered answer: the rough calculation is 15.7% below HEM', () => {
    expect(hemComparisonMarkdown()).toContain('| **15,455 kWh** | 13,032 kWh | **−15.7%** |');
  });

  it('compares the matched-air-temperature run, and leaves the 16 °C run uncompared', () => {
    const markdown = hemComparisonMarkdown();
    expect(markdown).toContain('| 13,660 kWh | 13,032 kWh | −4.6% |');
    expect(markdown).toMatch(/\| `thermostat-16` \|.*\| 11,971 kWh \|  \|  \|$/m);
  });
});

describe('needComparisonMarkdown', () => {
  it('shows each reading as gas, space heat at both efficiencies, and the gap', () => {
    const markdown = needComparisonMarkdown();
    expect(markdown).toContain('| 10,980 kWh | 7,600 kWh | 8,100 kWh | +71%, +61% |');
    expect(markdown).toContain('| 15,433 kWh | 11,400 kWh | 12,000 kWh | +14%, +8% |');
  });
});

describe('comparisonMarkdown', () => {
  it('prints both tables', () => {
    expect(comparisonMarkdown()).toBe(`${hemComparisonMarkdown()}\n\n${needComparisonMarkdown()}`);
  });

  it.each([
    ['step 2', hemComparisonMarkdown],
    ['step 3', needComparisonMarkdown],
  ])('the benchmark README shows the current %s table', (_step, table) => {
    const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    expect(readme, 'Run `npm run benchmark:tables` and paste its tables into the README').toContain(table());
  });
});
