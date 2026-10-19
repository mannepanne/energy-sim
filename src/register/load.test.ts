// ABOUT: Tests for the register loader: each integrity rule fails with a message naming the row and field
// ABOUT: Also covers ISO date checks, the cycle finder and the staleness warning

import { describe, expect, it } from 'vitest';
import { dueDate, formatIssue, loadRegister, RegisterValidationError, staleRows } from './load.ts';
import { findCycle, isIsoDate } from './schema.ts';

type Row = Record<string, unknown>;

const SOURCE = { title: 'A source', url: 'https://example.org/source' };

function fixedRow(overrides: Row = {}): Row {
  return {
    id: 'fabric.fixed',
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
  const { value: _value, ...base } = fixedRow({ id: 'fabric.uncertain', kind: 'uncertain' });
  return { ...base, default: 2, low: 1, high: 3, distribution: 'triangular', ...overrides };
}

function lognormalRow(overrides: Row = {}): Row {
  return uncertainRow({ id: 'fabric.lognormal', distribution: 'lognormal', default: 2.8, median: 2.8, sigma: 0.145, low: 2, high: 4, ...overrides });
}

function seriesRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'fabric.series', kind: 'series' });
  return { ...base, file: 'data/snapshots/x.json', schema: 'pvgis-tmy', columns: ['T2m'], ...overrides };
}

function profileRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'fabric.profile', kind: 'profile' });
  return { ...base, values: Array.from({ length: 24 }, () => 1), resolution: 'hour-of-day', ...overrides };
}

function tableRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'fabric.table', kind: 'table' });
  return {
    ...base,
    keyedBy: 'age band',
    cells: [
      { key: 'A', value: 1.7 },
      { key: 'B', value: 'solid' },
      { key: 'C', default: 2, low: 1, high: 3, distribution: 'triangular' },
    ],
    ...overrides,
  };
}

function correlationRow(overrides: Row = {}): Row {
  const { value: _value, ...base } = fixedRow({ id: 'fabric.correlation', kind: 'correlation', dependsOn: ['fabric.uncertain', 'fabric.lognormal'] });
  return { ...base, value: 0.5, between: ['fabric.uncertain', 'fabric.lognormal'], ...overrides };
}

const correlatedRows = (overrides: Row = {}): Row[] => [uncertainRow(), lognormalRow(), correlationRow(overrides)];

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
  it('accepts a valid register with all six row kinds', () => {
    const register = loadRegister({ rows: [fixedRow(), uncertainRow(), lognormalRow(), seriesRow(), profileRow(), tableRow(), correlationRow()] });
    expect(register.rows.map((row) => row.kind)).toEqual(['fixed', 'uncertain', 'uncertain', 'series', 'profile', 'table', 'correlation']);
  });

  it('accepts an approximate row with a rationale and no source', () => {
    expect(problemsFor([fixedRow({ status: 'approximate', source: undefined, rationale: 'An estimate.' })])).toEqual([]);
  });

  it('throws a RegisterValidationError whose message lists every problem', () => {
    expect(() => loadRegister({ rows: [fixedRow({ value: 'x', unit: '' })] })).toThrow(/field "value"[\s\S]*field "unit"|field "unit"[\s\S]*field "value"/);
  });

  describe('fails when a required field for the kind or status is missing', () => {
    it('a fixed row without a value', () => {
      expectProblem([fixedRow({ value: undefined })], 'fabric.fixed', 'value', 'expected number');
    });
    it('an uncertain row without a low', () => {
      expectProblem([uncertainRow({ low: undefined })], 'fabric.uncertain', 'low', 'expected number');
    });
    it('a series row without columns', () => {
      expectProblem([seriesRow({ columns: undefined })], 'fabric.series', 'columns', 'expected array');
    });
    it('a profile row without a resolution', () => {
      expectProblem([profileRow({ resolution: undefined })], 'fabric.profile', 'resolution', 'Invalid option');
    });
    it('a sourced row without a source', () => {
      expectProblem([fixedRow({ source: undefined })], 'fabric.fixed', 'source', 'required for a sourced row');
    });
    it('a to-verify row without a source', () => {
      expectProblem([fixedRow({ status: 'to-verify', source: undefined })], 'fabric.fixed', 'source', 'required for a to-verify row');
    });
    it('an approximate row without a rationale', () => {
      expectProblem([fixedRow({ status: 'approximate', source: undefined })], 'fabric.fixed', 'rationale', 'required for an approximate row');
    });
    it('a lognormal row without a median or sigma', () => {
      const rows = [lognormalRow({ median: undefined, sigma: undefined })];
      expectProblem(rows, 'fabric.lognormal', 'median', 'required for a lognormal row');
      expectProblem(rows, 'fabric.lognormal', 'sigma', 'required for a lognormal row');
    });
    it('an unknown kind', () => {
      expectProblem([fixedRow({ kind: 'curve' })], 'fabric.fixed', 'kind', 'Invalid discriminator value');
    });
  });

  it('fails on a field that does not belong to the kind', () => {
    expectProblem([fixedRow({ default: 2 })], 'fabric.fixed', 'default', 'Unrecognized key');
  });

  it('names a row with no usable id by its position', () => {
    const problems = problemsFor([fixedRow({ id: '' })]);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem).toMatch(/^Row rows\[0\], field "id"/);
  });

  describe('fails on uncertain ranges', () => {
    it('when the default lies outside low–high', () => {
      expectProblem([uncertainRow({ default: 4 })], 'fabric.uncertain', 'default', 'must lie within low–high (1–3)');
    });
    it('when low is above high', () => {
      expectProblem([uncertainRow({ low: 3, high: 1, default: 2 })], 'fabric.uncertain', 'low', 'must not be above high');
    });
    it('when a lognormal default differs from its median', () => {
      expectProblem([lognormalRow({ default: 3 })], 'fabric.lognormal', 'default', 'must equal median (2.8)');
    });
    it('when a lognormal sigma is not positive', () => {
      expectProblem([lognormalRow({ sigma: 0 })], 'fabric.lognormal', 'sigma', 'must be positive');
    });
    it('when a triangular row carries lognormal fields', () => {
      const rows = [uncertainRow({ median: 2, sigma: 0.1 })];
      expectProblem(rows, 'fabric.uncertain', 'median', 'only allowed on a lognormal row');
      expectProblem(rows, 'fabric.uncertain', 'sigma', 'only allowed on a lognormal row');
    });
    it('accepts low equal to high with the default between', () => {
      expect(problemsFor([uncertainRow({ default: 2, low: 2, high: 2 })])).toEqual([]);
    });
  });

  it('fails when a profile has the wrong number of values for its resolution', () => {
    expectProblem([profileRow({ resolution: 'month' })], 'fabric.profile', 'values', 'needs 12');
  });

  it('accepts an hour-of-week profile of 168 values', () => {
    expect(problemsFor([profileRow({ resolution: 'hour-of-week', values: Array.from({ length: 168 }, () => 0) })])).toEqual([]);
    expectProblem([profileRow({ resolution: 'hour-of-week' })], 'fabric.profile', 'values', 'needs 168');
  });

  describe('table rows', () => {
    it('fail when two cells share a key', () => {
      const cells = [{ key: 'A', value: 1 }, { key: 'A', value: 2 }];
      expectProblem([tableRow({ cells })], 'fabric.table', 'cells.1.key', 'duplicates the key of cells[0]');
    });

    it('fail when a key contains "|", the sampling separator', () => {
      expectProblem([tableRow({ cells: [{ key: 'A|B', value: 1 }] })], 'fabric.table', 'cells.0.key', 'must not contain "|"');
    });

    it('check an uncertain cell’s range like an uncertain row', () => {
      const cells = [{ key: 'A', default: 5, low: 1, high: 3, distribution: 'triangular' }];
      expectProblem([tableRow({ cells })], 'fabric.table', 'cells.0.default', 'must lie within low–high');
      const lognormal = [{ key: 'A', default: 2, low: 1, high: 3, distribution: 'lognormal', median: 2 }];
      expectProblem([tableRow({ cells: lognormal })], 'fabric.table', 'cells.0.sigma', 'is required for a lognormal row');
    });

    it('fail with no cells, no keyedBy, or a cell that is neither fixed nor uncertain', () => {
      expectProblem([tableRow({ cells: [] })], 'fabric.table', 'cells', '');
      expectProblem([tableRow({ keyedBy: undefined })], 'fabric.table', 'keyedBy', '');
      expectProblem([tableRow({ keyedBy: 'age-band' })], 'fabric.table', 'keyedBy', '');
      expectProblem([tableRow({ cells: [{ key: 'A', value: true }] })], 'fabric.table', 'cells.0', '');
    });
  });

  describe('correlation rows', () => {
    it('fail on a value of 1 or more in size', () => {
      expectProblem(correlatedRows({ value: 1 }), 'fabric.correlation', 'value', '');
      expectProblem(correlatedRows({ value: -1.2 }), 'fabric.correlation', 'value', '');
    });

    it('fail when the pair names one row twice, or the rows are missing from dependsOn', () => {
      expectProblem(correlatedRows({ between: ['fabric.uncertain', 'fabric.uncertain'] }), 'fabric.correlation', 'between', 'two different rows');
      expectProblem(correlatedRows({ dependsOn: ['fabric.uncertain'] }), 'fabric.correlation', 'dependsOn', 'must include "fabric.lognormal"');
    });

    it('fail when a named row is not an uncertain row', () => {
      const register = [uncertainRow(), fixedRow(), correlationRow({ between: ['fabric.uncertain', 'fabric.fixed'], dependsOn: ['fabric.uncertain', 'fabric.fixed'] })];
      expectProblem(register, 'fabric.correlation', 'between.1', 'is a fixed row, not an uncertain row');
    });

    it('fail when a row is in two correlations', () => {
      const second = correlationRow({ id: 'fabric.second' });
      expectProblem([...correlatedRows(), second], 'fabric.second', 'between.0', 'already correlated by rows[2]');
    });
  });

  it('fails when two rows share an id', () => {
    expectProblem([fixedRow(), fixedRow({ value: 2 })], 'fabric.fixed', 'id', 'duplicates the id of rows[0]');
  });

  it('fails when a dependsOn entry names a missing row', () => {
    expectProblem([fixedRow({ dependsOn: ['fabric.nowhere'] })], 'fabric.fixed', 'dependsOn.0', 'missing row "fabric.nowhere"');
  });

  it('fails when dependencies form a cycle', () => {
    const rows = [
      fixedRow({ id: 'fabric.a', dependsOn: ['fabric.b'] }),
      fixedRow({ id: 'fabric.b', dependsOn: ['fabric.c'] }),
      fixedRow({ id: 'fabric.c', dependsOn: ['fabric.a'] }),
    ];
    expectProblem(rows, 'fabric.a', 'dependsOn', 'forms a cycle: fabric.a → fabric.b → fabric.c → fabric.a');
  });

  it('fails when a row depends on itself', () => {
    expectProblem([fixedRow({ dependsOn: ['fabric.fixed'] })], 'fabric.fixed', 'dependsOn', 'fabric.fixed → fabric.fixed');
  });

  describe('fails when lastChecked is not a valid ISO date', () => {
    it.each(['2026-02-30', '2026-13-01', '17/10/2026', '2026-10-17T00:00:00Z'])('%s', (date) => {
      expectProblem([fixedRow({ lastChecked: date })], 'fabric.fixed', 'lastChecked', 'valid ISO date');
    });
  });

  it('fails when validUntil is not a date or comes before lastChecked', () => {
    expectProblem([fixedRow({ validUntil: '2026-02-30' })], 'fabric.fixed', 'validUntil', 'valid ISO date');
    expectProblem([fixedRow({ lastChecked: '2026-10-17', validUntil: '2026-10-16' })], 'fabric.fixed', 'validUntil', 'must not be before lastChecked');
  });

  it('fails when the id does not start with its section', () => {
    expectProblem([fixedRow({ id: 'geometry.fixed' })], 'geometry.fixed', 'id', 'must start with its section ("fabric.")');
  });

  it('fails on a source link that is not https', () => {
    expectProblem([fixedRow({ source: { title: 'A source', url: 'javascript:alert(1)' } })], 'fabric.fixed', 'source.url', '');
    expectProblem([fixedRow({ source: { title: 'A source', url: 'http://example.org' } })], 'fabric.fixed', 'source.url', '');
  });

  it('fails on a series file outside data/snapshots/', () => {
    expectProblem([seriesRow({ file: '../secrets.json' })], 'fabric.series', 'file', 'must be a file in data/snapshots/');
  });

  it('fails on a bad refresh cadence', () => {
    expectProblem([fixedRow({ refreshCadence: 0 })], 'fabric.fixed', 'refreshCadence', '');
    expectProblem([fixedRow({ refreshCadence: 'monthly' })], 'fabric.fixed', 'refreshCadence', '');
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
      fixedRow({ id: 'fabric.quarterly', refreshCadence: 'quarterly', lastChecked: '2026-10-17' }),
      fixedRow({ id: 'fabric.yearly', refreshCadence: 'yearly', lastChecked: '2026-10-17' }),
      fixedRow({ id: 'fabric.months', refreshCadence: 36, lastChecked: '2026-10-17' }),
      fixedRow({ id: 'fabric.static', refreshCadence: 'static', lastChecked: '2000-01-01' }),
    ],
  });

  it('computes due dates from the cadence, clamping to the end of a short month', () => {
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 'quarterly' })).toBe('2027-01-17');
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 'yearly' })).toBe('2027-10-17');
    expect(dueDate({ lastChecked: '2027-01-31', refreshCadence: 1 })).toBe('2027-02-28');
    expect(dueDate({ lastChecked: '2000-01-01', refreshCadence: 'static' })).toBeUndefined();
  });

  it('falls due on validUntil when that comes before the cadence date', () => {
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 'quarterly', validUntil: '2026-12-31' })).toBe('2026-12-31');
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 1, validUntil: '2026-12-31' })).toBe('2026-11-17');
    expect(dueDate({ lastChecked: '2026-10-17', refreshCadence: 'static', validUntil: '2030-01-01' })).toBe('2030-01-01');
  });

  it('lists rows past their due date, and never static rows', () => {
    expect(staleRows(register, '2027-01-17')).toEqual([]);
    expect(staleRows(register, '2027-01-18').map((row) => row.id)).toEqual(['fabric.quarterly']);
    expect(staleRows(register, '2030-01-01')).toEqual([
      { id: 'fabric.quarterly', lastChecked: '2026-10-17', dueBy: '2027-01-17' },
      { id: 'fabric.yearly', lastChecked: '2026-10-17', dueBy: '2027-10-17' },
      { id: 'fabric.months', lastChecked: '2026-10-17', dueBy: '2029-10-17' },
    ]);
  });

  it('rejects an invalid as-of date', () => {
    expect(() => staleRows(register, '2026-02-30')).toThrow('asOf must be a valid ISO date');
  });
});
