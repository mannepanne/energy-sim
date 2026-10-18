// ABOUT: Tests for the register loader: each integrity rule fails with a message naming the row and field
// ABOUT: Also covers ISO date checks, the cycle finder and the staleness warning

import { describe, expect, it } from 'vitest';
import { dueDate, formatIssue, loadRegister, RegisterValidationError, staleRows } from './load.ts';
import { findCycle, isIsoDate } from './schema.ts';

type Row = Record<string, unknown>;

const SOURCE = { title: 'A source', url: 'https://example.org/source' };

function fixedRow(overrides: Row = {}): Row {
  return {
    id: 'test.fixed',
    kind: 'fixed',
    section: 'fabric',
    label: 'A fixed row',
    unit: 'W/m²K',
    status: 'sourced',
    source: SOURCE,
    lastChecked: '2026-10-17',
    refreshCadence: 'static',
    overridable: false,
    overrideHint: null,
    dependsOn: [],
    value: 1.5,
    ...overrides,
  };
}

function uncertainRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'test.uncertain', kind: 'uncertain' });
  return { ...base, default: 2, low: 1, high: 3, distribution: 'triangular', ...overrides };
}

function lognormalRow(overrides: Row = {}): Row {
  return uncertainRow({ id: 'test.lognormal', distribution: 'lognormal', default: 2.8, median: 2.8, sigma: 0.145, low: 2, high: 4, ...overrides });
}

function seriesRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'test.series', kind: 'series' });
  return { ...base, file: 'data/snapshots/x.json', schema: 'pvgis-tmy', columns: ['T2m'], ...overrides };
}

function profileRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'test.profile', kind: 'profile' });
  return { ...base, values: Array.from({ length: 24 }, () => 1), resolution: 'hour-of-day', ...overrides };
}

function problemsFor(rows: unknown): string[] {
  try {
    loadRegister({ rows });
  } catch (error) {
    if (error instanceof RegisterValidationError) return [...error.problems];
    throw error;
  }
  return [];
}

function expectProblem(rows: Row[], id: string, field: string, fragment: string): void {
  const problems = problemsFor(rows);
  const match = problems.find((problem) => problem.includes(`"${id}"`) && problem.includes(`field "${field}"`));
  expect(match, `no problem naming row "${id}" and field "${field}" in:\n${problems.join('\n')}`).toBeDefined();
  expect(match).toContain(fragment);
}

describe('loadRegister', () => {
  it('accepts a valid register with all four row kinds', () => {
    const register = loadRegister({ rows: [fixedRow(), uncertainRow(), lognormalRow(), seriesRow(), profileRow()] });
    expect(register.rows.map((row) => row.kind)).toEqual(['fixed', 'uncertain', 'uncertain', 'series', 'profile']);
  });

  it('accepts an approximate row with a rationale and no source', () => {
    expect(problemsFor([fixedRow({ status: 'approximate', source: undefined, rationale: 'An estimate.' })])).toEqual([]);
  });

  it('throws a RegisterValidationError whose message lists every problem', () => {
    expect(() => loadRegister({ rows: [fixedRow({ value: 'x', unit: '' })] })).toThrow(/field "value"[\s\S]*field "unit"|field "unit"[\s\S]*field "value"/);
  });

  describe('fails when a required field for the kind or status is missing', () => {
    it('a fixed row without a value', () => {
      expectProblem([fixedRow({ value: undefined })], 'test.fixed', 'value', 'expected number');
    });
    it('an uncertain row without a low', () => {
      expectProblem([uncertainRow({ low: undefined })], 'test.uncertain', 'low', 'expected number');
    });
    it('a series row without columns', () => {
      expectProblem([seriesRow({ columns: undefined })], 'test.series', 'columns', 'expected array');
    });
    it('a profile row without a resolution', () => {
      expectProblem([profileRow({ resolution: undefined })], 'test.profile', 'resolution', 'Invalid option');
    });
    it('a sourced row without a source', () => {
      expectProblem([fixedRow({ source: undefined })], 'test.fixed', 'source', 'required for a sourced row');
    });
    it('a to-verify row without a source', () => {
      expectProblem([fixedRow({ status: 'to-verify', source: undefined })], 'test.fixed', 'source', 'required for a to-verify row');
    });
    it('an approximate row without a rationale', () => {
      expectProblem([fixedRow({ status: 'approximate', source: undefined })], 'test.fixed', 'rationale', 'required for an approximate row');
    });
    it('a lognormal row without a median or sigma', () => {
      const rows = [lognormalRow({ median: undefined, sigma: undefined })];
      expectProblem(rows, 'test.lognormal', 'median', 'required for a lognormal row');
      expectProblem(rows, 'test.lognormal', 'sigma', 'required for a lognormal row');
    });
    it('an unknown kind', () => {
      expectProblem([fixedRow({ kind: 'curve' })], 'test.fixed', 'kind', 'Invalid discriminator value');
    });
  });

  it('fails on a field that does not belong to the kind', () => {
    expectProblem([fixedRow({ default: 2 })], 'test.fixed', 'default', 'Unrecognized key');
  });

  it('names a row with no usable id by its position', () => {
    expect(problemsFor([fixedRow({ id: '' })])).toEqual([expect.stringMatching(/^Row rows\[0\], field "id"/)]);
  });

  describe('fails on uncertain ranges', () => {
    it('when the default lies outside low–high', () => {
      expectProblem([uncertainRow({ default: 4 })], 'test.uncertain', 'default', 'must lie within low–high (1–3)');
    });
    it('when low is above high', () => {
      expectProblem([uncertainRow({ low: 3, high: 1, default: 2 })], 'test.uncertain', 'low', 'must not be above high');
    });
    it('when a lognormal default differs from its median', () => {
      expectProblem([lognormalRow({ default: 3 })], 'test.lognormal', 'default', 'must equal median (2.8)');
    });
    it('when a lognormal sigma is not positive', () => {
      expectProblem([lognormalRow({ sigma: 0 })], 'test.lognormal', 'sigma', 'must be positive');
    });
    it('when a triangular row carries lognormal fields', () => {
      const rows = [uncertainRow({ median: 2, sigma: 0.1 })];
      expectProblem(rows, 'test.uncertain', 'median', 'only allowed on a lognormal row');
      expectProblem(rows, 'test.uncertain', 'sigma', 'only allowed on a lognormal row');
    });
    it('accepts low equal to high with the default between', () => {
      expect(problemsFor([uncertainRow({ default: 2, low: 2, high: 2 })])).toEqual([]);
    });
  });

  it('fails when a profile has the wrong number of values for its resolution', () => {
    expectProblem([profileRow({ resolution: 'month' })], 'test.profile', 'values', 'needs 12');
  });

  it('fails when two rows share an id', () => {
    expectProblem([fixedRow(), fixedRow({ value: 2 })], 'test.fixed', 'id', 'duplicates the id of rows[0]');
  });

  it('fails when a dependsOn entry names a missing row', () => {
    expectProblem([fixedRow({ dependsOn: ['test.nowhere'] })], 'test.fixed', 'dependsOn.0', 'missing row "test.nowhere"');
  });

  it('fails when dependencies form a cycle', () => {
    const rows = [
      fixedRow({ id: 'a', dependsOn: ['b'] }),
      fixedRow({ id: 'b', dependsOn: ['c'] }),
      fixedRow({ id: 'c', dependsOn: ['a'] }),
    ];
    expectProblem(rows, 'a', 'dependsOn', 'forms a cycle: a → b → c → a');
  });

  it('fails when a row depends on itself', () => {
    expectProblem([fixedRow({ dependsOn: ['test.fixed'] })], 'test.fixed', 'dependsOn', 'test.fixed → test.fixed');
  });

  describe('fails when lastChecked is not a valid ISO date', () => {
    it.each(['2026-02-30', '2026-13-01', '17/10/2026', '2026-10-17T00:00:00Z'])('%s', (date) => {
      expectProblem([fixedRow({ lastChecked: date })], 'test.fixed', 'lastChecked', 'valid ISO date');
    });
  });

  it('fails on a bad refresh cadence', () => {
    expectProblem([fixedRow({ refreshCadence: 0 })], 'test.fixed', 'refreshCadence', '');
    expectProblem([fixedRow({ refreshCadence: 'monthly' })], 'test.fixed', 'refreshCadence', '');
  });

  it('reports problems outside the rows against the register', () => {
    expect(problemsFor(undefined)).toEqual([expect.stringMatching(/^Register, field "rows"/)]);
    expect(() => loadRegister(null)).toThrow(/Register: /);
    expect(() => loadRegister({ rows: [], extra: 1 })).toThrow(/Register: .*extra/);
  });
});

describe('formatIssue', () => {
  it('handles an issue on a whole row with no field', () => {
    const message = formatIssue({ code: 'custom', path: ['rows', 0], message: 'is wrong', input: undefined }, { rows: [{ id: 'x' }] });
    expect(message).toBe('Row "x" (rows[0]): is wrong');
  });
});

describe('isIsoDate', () => {
  it('accepts real dates, including a leap day in a leap year', () => {
    expect(isIsoDate('2026-10-17')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });
  it('rejects impossible dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
  });
});

describe('findCycle', () => {
  it('returns undefined for an acyclic graph with shared dependencies', () => {
    const graph = new Map([
      ['a', ['b', 'c']],
      ['b', ['c']],
      ['c', []],
    ]);
    expect(findCycle(graph)).toBeUndefined();
  });
});

describe('staleness', () => {
  const register = loadRegister({
    rows: [
      fixedRow({ id: 'quarterly', refreshCadence: 'quarterly', lastChecked: '2026-10-17' }),
      fixedRow({ id: 'yearly', refreshCadence: 'yearly', lastChecked: '2026-10-17' }),
      fixedRow({ id: 'months', refreshCadence: 36, lastChecked: '2026-10-17' }),
      fixedRow({ id: 'static', refreshCadence: 'static', lastChecked: '2000-01-01' }),
    ],
  });

  it('computes due dates from the cadence, clamping to the end of a short month', () => {
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 'quarterly' })).toBe('2027-01-17');
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 'yearly' })).toBe('2027-10-17');
    expect(dueDate({ lastChecked: '2027-01-31', refreshCadence: 1 })).toBe('2027-02-28');
    expect(dueDate({ lastChecked: '2000-01-01', refreshCadence: 'static' })).toBeUndefined();
  });

  it('lists rows past their due date, and never static rows', () => {
    expect(staleRows(register, '2027-01-17')).toEqual([]);
    expect(staleRows(register, '2027-01-18').map((row) => row.id)).toEqual(['quarterly']);
    expect(staleRows(register, '2030-01-01')).toEqual([
      { id: 'quarterly', lastChecked: '2026-10-17', dueBy: '2027-01-17' },
      { id: 'yearly', lastChecked: '2026-10-17', dueBy: '2027-10-17' },
      { id: 'months', lastChecked: '2026-10-17', dueBy: '2029-10-17' },
    ]);
  });

  it('rejects an invalid as-of date', () => {
    expect(() => staleRows(register, '2026-02-30')).toThrow('asOf must be a valid ISO date');
  });
});
