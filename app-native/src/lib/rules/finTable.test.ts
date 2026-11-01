import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextSort, sortRows } from '../finTable.ts';

type R = { name: string; value: string; start: string };
const rows: R[] = [
  { name: 'Riverside', value: '£12,000', start: '2026-03-01' },
  { name: 'andy house', value: '—', start: '' },
  { name: 'Harbour Mill', value: '£900', start: '2026-01-15' },
];
const cols = [{ k: 'name' }, { k: 'value' }, { k: 'start', sort: (r: R) => r.start }];
const text = (c: { k: string }, r: R) => String((r as unknown as Record<string, string>)[c.k]);

test('a heading goes A to Z, then Z to A, then off', () => {
  const a = nextSort(null, 'name');
  assert.deepEqual(a, { k: 'name', dir: 'asc' });
  const b = nextSort(a, 'name');
  assert.deepEqual(b, { k: 'name', dir: 'desc' });
  assert.equal(nextSort(b, 'name'), null);
  assert.deepEqual(nextSort(b, 'value'), { k: 'value', dir: 'asc' });
});

test('names sort A to Z ignoring case, and back', () => {
  assert.deepEqual(sortRows(rows, cols, { k: 'name', dir: 'asc' }, text).map((r: R) => r.name), ['andy house', 'Harbour Mill', 'Riverside']);
  assert.deepEqual(sortRows(rows, cols, { k: 'name', dir: 'desc' }, text).map((r: R) => r.name), ['Riverside', 'Harbour Mill', 'andy house']);
});

test('money sorts as numbers, and a dash goes last either way', () => {
  assert.deepEqual(sortRows(rows, cols, { k: 'value', dir: 'asc' }, text).map((r: R) => r.name), ['Harbour Mill', 'Riverside', 'andy house']);
  assert.deepEqual(sortRows(rows, cols, { k: 'value', dir: 'desc' }, text).map((r: R) => r.name), ['Riverside', 'Harbour Mill', 'andy house']);
});

test('a column with its own rule uses it, blanks last', () => {
  assert.deepEqual(sortRows(rows, cols, { k: 'start', dir: 'asc' }, text).map((r: R) => r.name), ['Harbour Mill', 'Riverside', 'andy house']);
});

test('no choice leaves the rows as they came', () => {
  assert.deepEqual(sortRows(rows, cols, null, text).map((r: R) => r.name), ['Riverside', 'andy house', 'Harbour Mill']);
});
