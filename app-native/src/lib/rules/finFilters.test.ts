/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dateRange, monthLabel, monthsIn, valueTest } from './finFilters.ts';

test('finance list filters: months, date ranges, value box', () => {
  assert.equal(monthLabel('2026-10'), 'Oct 2026');
  assert.deepEqual(monthsIn([{ d: '2026-09-02' }, { d: '2026-10-29' }, { d: '2026-09-30' }], (r) => r.d.slice(0, 7)), ['2026-10', '2026-09']);
  assert.deepEqual(dateRange('month', '2026-10-29'), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(dateRange('last', '2026-01-15'), ['2025-12-01', '2025-12-31']);
  assert.deepEqual(dateRange('quarter', '2026-11-05'), ['2026-10-01', '2026-12-31']);
  assert.deepEqual(dateRange('12m', '2026-10-29'), ['2025-10-29', '2026-10-29']);
  assert.equal(dateRange('', '2026-10-29'), null);
  assert.equal(valueTest('>100k')?.(150000), true); assert.equal(valueTest('>100k')?.(50000), false);
  assert.equal(valueTest('25k-100k')?.(30000), true); assert.equal(valueTest('<25k')?.(30000), false);
  assert.equal(valueTest('£50,000')?.(50000), true); assert.equal(valueTest('abc'), null);
});
