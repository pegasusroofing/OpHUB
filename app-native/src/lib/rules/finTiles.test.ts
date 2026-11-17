/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contractFigure, dueOutFigure, overdueFigure, owedFigure, paidOnStatements, readViews, retentionFigure, tileLabel, toInvoiceFigure, unpaidSupplierInvoices, writeViews, type InvRow, type JobRow } from './finTiles.ts';

const jobs: JobRow[] = [
  { id: 'a', status: 'live', start: '2026-02-01', client: 'Bellway', value: 100000, invoiced: 40000, ret: 1500 },
  { id: 'b', status: 'live', start: '2026-06-10', client: 'Persimmon', value: 50000, invoiced: 60000, ret: 0 },
  { id: 'c', status: 'upcoming', start: '2026-12-01', client: 'Bellway', value: 20000, invoiced: 0, ret: 0 },
  { id: 'd', status: 'closed', start: '2025-03-01', client: 'Taylor Wimpey', value: 80000, invoiced: 80000, ret: 2000 },
];

test('the standard views, and what is saved: only the changed tiles, read back the same', () => {
  const v = readViews(null);
  assert.deepEqual([v.live_value.k, v.to_invoice.k, v.owed.k, v.overdue.k, v.due_out.k, v.ret_held.k], ['live', 'live', 'all', 'all', 'all', 'all']);
  assert.equal(writeViews(v), null);
  const w = { ...v, live_value: { k: 'closed' }, owed: { k: 'client', who: 'Bellway: North' }, due_out: { k: 'dates', from: '2026-11-01', to: '2026-11-30' } };
  const saved = writeViews(w);
  assert.deepEqual(saved, ['live_value=closed', 'owed=client:Bellway: North', 'due_out=dates:2026-11-01:2026-11-30']);
  assert.deepEqual(readViews(saved), w);
  // Anything not understood is the standard: the old swap list, a choice a tile hasn't got, bad dates.
  const r = readViews(['live_value', 'due_out', 'overdue=d30', 'owed=dates:x:y', 'ret_held=closed']);
  assert.deepEqual([r.overdue.k, r.owed.k, r.ret_held.k], ['all', 'all', 'closed']);
});

test('the tile names say what they show', () => {
  assert.equal(tileLabel('live_value', { k: 'live' }), 'Live Contract Value');
  assert.equal(tileLabel('live_value', { k: 'all' }), 'Total Contract Value');
  assert.equal(tileLabel('live_value', { k: 'client', who: 'Bellway' }), 'Contract Value · Bellway');
  assert.equal(tileLabel('to_invoice', { k: 'live' }), 'Still To Invoice');
  assert.equal(tileLabel('to_invoice', { k: 'upcoming' }), 'Still To Invoice · Upcoming');
  assert.equal(tileLabel('owed', { k: 'd30' }), 'Owed To You · Next 30 Days');
  assert.match(tileLabel('owed', { k: 'dates', from: '2026-01-01', to: '2026-03-31' }), /^Owed To You · Due 1 Jan.* – 31 Mar/);
  assert.equal(tileLabel('overdue', { k: 'o60' }), 'Overdue · 60+ Days');
  assert.equal(tileLabel('due_out', { k: 'supplier', who: 'SIG' }), 'Due Out To Suppliers · SIG');
  assert.equal(tileLabel('ret_held', { k: 'all' }), 'Retention Held By Clients');
});

test('contract value and still to invoice: live, upcoming, closed, all, by start date, by client', () => {
  assert.deepEqual(contractFigure(jobs, { k: 'live' }), { v: 150000, note: '2 Live Jobs' });
  assert.deepEqual(contractFigure(jobs, { k: 'upcoming' }), { v: 20000, note: '1 Upcoming Job' });
  assert.deepEqual(contractFigure(jobs, { k: 'closed' }), { v: 80000, note: '1 Closed Job' });
  assert.deepEqual(contractFigure(jobs, { k: 'all' }), { v: 250000, note: '4 Jobs' });
  assert.deepEqual(contractFigure(jobs, { k: 'dates', from: '2026-01-01', to: '2026-05-31' }), { v: 100000, note: '1 Job' });
  assert.deepEqual(contractFigure(jobs, { k: 'client', who: 'Bellway' }), { v: 120000, note: '2 Jobs' });
  assert.equal(toInvoiceFigure(jobs, { k: 'live' }).v, 60000); // b is over-invoiced: nothing, not minus
  assert.equal(toInvoiceFigure(jobs, { k: 'all' }).v, 80000);
});

test('owed and overdue: next 30 / 60 days, by due date, by client, how late', () => {
  const now = '2026-11-17';
  const invs: InvRow[] = [
    { out: 1000, due: '2026-11-20', overdue: false, client: 'Bellway' },
    { out: 2000, due: '2026-12-31', overdue: false, client: 'Persimmon' },
    { out: 4000, due: '2027-03-01', overdue: false, client: 'Bellway' },
    { out: 500, due: '2026-11-01', overdue: true, client: 'Bellway' },
    { out: 300, due: '2026-08-01', overdue: true, client: 'Persimmon' },
    { out: 0, due: '2026-11-25', overdue: false, client: 'Bellway' },
  ];
  assert.deepEqual(owedFigure(invs, { k: 'all' }, now), { v: 7800, note: '5 Invoices' });
  assert.deepEqual(owedFigure(invs, { k: 'd30' }, now), { v: 1000, note: '1 Invoice' });
  assert.equal(owedFigure(invs, { k: 'd60' }, now).v, 3000);
  assert.equal(owedFigure(invs, { k: 'dates', from: '2026-12-01', to: '2027-12-31' }, now).v, 6000);
  assert.equal(owedFigure(invs, { k: 'client', who: 'Bellway' }, now).v, 5500);
  assert.deepEqual(overdueFigure(invs, { k: 'all' }, now), { v: 800, note: '2 Invoices' });
  assert.equal(overdueFigure(invs, { k: 'o30' }, now).v, 300);
  assert.equal(overdueFigure(invs, { k: 'o90' }, now).v, 300);
  assert.equal(overdueFigure(invs, { k: 'client', who: 'Bellway' }, now).v, 500);
});

test('due out to suppliers: approved and still to approve, the note says how much needs approval; no paid or subcontract ones', () => {
  const paid = paidOnStatements([
    { status: 'reconciled', statement_date: '2026-11-01', lines: [{ match: 'p3' }, { match: 'in:x' }] },
    { status: 'open', statement_date: '2026-11-10', lines: [{ match: 'p4', allocated: true }, { match: 'p5' }, { match: 'p6', allocated: true, ignore: true }] },
  ]);
  assert.deepEqual(Object.keys(paid).sort(), ['p3', 'p4']);
  const rows = unpaidSupplierInvoices([
    { id: 'p1', status: 'approved', total: 1200, due_date: '2026-11-30', supplier_name: 'SIG' },
    { id: 'p2', status: 'approved', total: 600, paid_on: '2026-11-02' },
    { id: 'p3', status: 'approved', total: 300 },
    { id: 'p4', status: 'approved', total: 50 },
    { id: 'p5', status: 'approved', total: 100, due_date: '2026-10-01', supplier_name: 'Jewson' },
    { id: 'p6', status: 'to_approve', total: 240, due_date: '2026-12-01', supplier_name: 'SIG' },
    { id: 'p7', status: 'query', total: 60, supplier_name: 'Jewson' },
    { id: 'p8', status: 'rejected', total: 5000 },
    { id: 'p9', status: 'approved', total: 7000, sub_job_id: 'sj1' },
  ], paid);
  const now = '2026-11-17';
  assert.deepEqual(dueOutFigure(rows, { k: 'all' }, now), { v: 1600, note: '£300 Needs Approval' });
  assert.deepEqual(dueOutFigure(rows, { k: 'd30' }, now), { v: 1440, note: '£240 Needs Approval' });
  assert.deepEqual(dueOutFigure(rows, { k: 'late' }, now), { v: 100, note: '1 Invoice' });
  assert.deepEqual(dueOutFigure(rows, { k: 'supplier', who: 'Jewson' }, now), { v: 160, note: '£60 Needs Approval' });
});

test('retention held: all, live, closed, by client', () => {
  assert.deepEqual(retentionFigure(jobs, { k: 'all' }), { v: 3500, note: '2 Jobs' });
  assert.equal(retentionFigure(jobs, { k: 'live' }).v, 1500);
  assert.equal(retentionFigure(jobs, { k: 'closed' }).v, 2000);
  assert.equal(retentionFigure(jobs, { k: 'client', who: 'Taylor Wimpey' }).v, 2000);
});
