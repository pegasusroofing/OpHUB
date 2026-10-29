/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { itemPlots, monthlyReport, monthlyRows } from './finMonthly.ts';

test('monthly report: month deltas, plot groups, not allocated, forecasts, running totals', () => {
  const items = [{ id: 's1', kind: 'section', sub_job_id: 'p1' }, { id: 'i1', kind: 'item', value: 1000, cost: 600 }, { id: 's2', kind: 'section', sub_job_id: 'p2' }, { id: 'i2', kind: 'item', value: 500, cost: 300 }];
  assert.deepEqual(itemPlots(items), { s1: 'p1', i1: 'p1', s2: 'p2', i2: 'p2' });
  const r = monthlyReport({
    apps: [
      { number: 1, status: 'certified', valuation_date: '2026-09-25', gross: 600, cert_gross: 550, cert_date: '2026-10-02', lines: [{ item_id: 'i1', value: 1000, pct: 50 }, { item_id: 'i2', value: 500, pct: 20 }] },
      { number: 2, status: 'applied', valuation_date: '2026-10-25', gross: 1000, lines: [{ item_id: 'i1', value: 1000, pct: 80 }, { item_id: 'i2', value: 500, pct: 40 }] },
    ],
    invs: [{ status: 'issued', issue_date: '2026-10-03', net: 550 }],
    lines: [{ cat: 'materials', date: '2026-09-10', net: 200, sub: 'p1' }, { cat: 'labour', date: '2026-10-10', net: 100, sub: null }, { cat: 'committed', date: null, net: 50, sub: 'p2' }],
    items, subs: [{ id: 'p1', name: 'Plot 1' }, { id: 'p2', name: 'Plot 2' }], forecast: { value: 1500, budget: 900, final: 950 }, subValues: { p1: 1000, p2: 500 }, today: '2026-11-05',
  });
  assert.deepEqual(r.months, ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(r.data.all.applied, { '2026-09': 600, '2026-10': 400 });
  assert.deepEqual(r.data.all.certified, { '2026-10': 550 });
  assert.deepEqual(r.data.p1.applied, { '2026-09': 500, '2026-10': 300 });
  assert.deepEqual(r.data.p2.applied, { '2026-09': 100, '2026-10': 100 });
  assert.deepEqual(r.data.none.cost, { '2026-10': 100 });
  assert.deepEqual(r.fcast.p2, { value: 500, budget: 300, final: 300 });
  const rows = monthlyRows(r, true);
  assert.deepEqual(rows[0].rows[0].vals, [600, 1000, 1000]);
  assert.deepEqual(rows[1].rows.map((x) => x.label), ['Applied', 'Actual costs', 'Forecast value', 'Forecast budget', 'Forecast final cost']);
});
