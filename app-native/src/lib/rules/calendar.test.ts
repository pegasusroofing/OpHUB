/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deliveryLines, monthGrid, ordinal, recurrenceDates, reminderDate } from './calendar.ts';

test('recurrence', () => {
  assert.deepEqual(recurrenceDates('2026-11-02', 'none', null, false), ['2026-11-02']);
  assert.deepEqual(recurrenceDates('2026-01-31', 'monthly', null, false).slice(0, 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(recurrenceDates('2026-11-02', 'weekly', null, false).length, 53);
  assert.deepEqual(recurrenceDates('2026-11-02', 'weekly', '2026-11-20T10:00:00', false), ['2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(recurrenceDates('2026-11-02', 'daily', null, true), ['2026-11-02']);
  assert.equal(recurrenceDates('2026-11-02', 'daily', null, false).length, 60);
});

test('reminder dates, ordinals, month grid, deliveries', () => {
  assert.equal(reminderDate('2026-11-01', 'day_before', ''), '2026-10-31');
  assert.equal(reminderDate('2026-11-01', 'custom', '2026-10-25'), '2026-10-25');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'st', 'nd']);
  const g = monthGrid(2026, 10); // November 2026: 1st is a Sunday
  assert.equal(g[0], '2026-10-26');
  assert.equal(g[g.length - 1], '2026-12-06');
  assert.equal(g.length % 7, 0);
  assert.deepEqual(deliveryLines([{ required_by: '2026-11-03', supplier_name: 'SIG' }, { date: 'x' }, { delivery_date: '2026-11-04', fulfilment: 'collection' }]),
    [{ date: '2026-11-03', title: '🚚 Delivery: SIG' }, { date: '2026-11-04', title: '🚚 Collection' }]);
});
