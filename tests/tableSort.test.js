import test from 'node:test';
import assert from 'node:assert/strict';
import { sortTableRows } from '../src/lib/tableSort.js';
test('table sorting handles natural asset numbers, calendar dates, numeric durations and missing values without mutation', () => {
  const rows = [{ code: 'PC-10', days: 10, due: '2026-11-01' }, { code: 'PC-2', days: 2, due: '2026-11-09' }, { code: '', days: NaN, due: '' }];
  const sort = (key, dir) => sortTableRows(rows, { key, dir }, (row, field) => row[field]);
  assert.deepEqual(sort('code', 'asc').map((row) => row.code), ['PC-2', 'PC-10', '']);
  assert.deepEqual(sort('days', 'desc').map((row) => row.code), ['PC-10', 'PC-2', '']);
  assert.deepEqual(sort('due', 'desc').map((row) => row.code), ['PC-2', 'PC-10', '']);
  assert.equal(rows[0].code, 'PC-10');
});
