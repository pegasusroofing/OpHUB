/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allocs, costLines, forecast, type Book } from './finBook.ts';

const empty = (): Book => ({ siteId: 'S', jf: [], invs: [], apps: [], pinvs: [], pos: [], cks: [], manual: [], hires: [], extra: [], budgets: [], vars: [], scs: [], sapps: [], rates: {}, cpos: [], items: [], ops: [], names: { u1: 'Jake' } });

test('split rows share their cost', () => {
  assert.deepEqual(allocs({ site_id: 'S', split: [{ site_id: 'S', pct: 60 }, { site_id: 'T', pct: 40 }] }, { poBy: {} }).map((a) => a.share), [0.6, 0.4]);
  assert.deepEqual(allocs({ site_id: 'S', items: [{ sub_job_id: 'a', amount: 30 }, { sub_job_id: 'b', amount: 10 }] }, { poBy: {} }).map((a) => [a.sub, a.share]), [['a', 0.75], ['b', 0.25]]);
});

test('cost lines and forecast for a job', () => {
  const b = empty();
  b.jf = [{ site_id: 'S', contract_value: 10000, ohp_pct: 10 }];
  b.pinvs = [{ id: 'p1', site_id: 'S', status: 'approved', net: 1000, invoice_date: '2026-01-05', po_id: 'po1' }];
  b.pos = [{ id: 'po1', site_id: 'S', status: 'open', value: 1500, number: 'PO1', created_at: '2026-01-01' }];
  b.cks = [{ user_id: 'u1', site_id: 'S', ts: '2026-01-06T08:00:00', type: 'in' }, { user_id: 'u1', site_id: 'S', ts: '2026-01-06T13:00:00', type: 'in' }];
  b.rates = { u1: { pay_type: 'paye', day_rate: 200 } };
  b.vars = [{ site_id: 'S', status: 'agreed', quoted: 500 }, { site_id: 'S', status: 'submitted', quoted: 300 }];
  b.apps = [{ site_id: 'S', number: 1, status: 'certified', gross: 4000, cert_gross: 3800 }];
  const L = costLines(b, 'S');
  assert.deepEqual(L.map((l) => [l.cat, l.net]), [['materials', 1000], ['committed', 500], ['labour', 200]]);
  const fc = forecast(b, 'S', null);
  assert.equal(fc.costToDate, 1200); assert.equal(fc.committedTotal, 500);
  assert.equal(fc.ffa, 10800); assert.equal(fc.valuation, 3800);
  assert.equal(fc.ohpPct, 10); assert.equal(fc.salesMargin, 3800 - 1200 - 380);
});
