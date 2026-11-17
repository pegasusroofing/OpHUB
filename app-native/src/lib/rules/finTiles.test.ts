/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_FIN_TILES, finTileOrder, isStandardTiles, paidOnStatements, setFinTile, supplierDueOut } from './finTiles.ts';

test('the standard six: jobs as a note on the first, Due Out To Suppliers fifth', () => {
  assert.deepEqual(finTileOrder(null), ['live_value', 'to_invoice', 'owed', 'overdue', 'due_out', 'ret_held']);
  assert.equal(finTileOrder([])[4], 'due_out');
  assert.equal(isStandardTiles(finTileOrder(undefined)), true);
});

test('a saved six is tidied: unknown and repeated dropped, gaps filled from the standard', () => {
  assert.deepEqual(finTileOrder(['due_out', 'nonsense', 'due_out', 'live_jobs']), ['due_out', 'live_jobs', 'live_value', 'to_invoice', 'owed', 'overdue']);
  assert.equal(finTileOrder(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).length, 6);
  assert.equal(new Set(finTileOrder(['owed', 'owed', 'owed'])).size, 6);
});

test('choosing what a tile shows swaps it with the tile that showed it', () => {
  const o = [...DEFAULT_FIN_TILES];
  assert.deepEqual(setFinTile(o, 0, 'live_jobs'), ['live_jobs', 'to_invoice', 'owed', 'overdue', 'due_out', 'ret_held']);
  assert.deepEqual(setFinTile(o, 0, 'due_out'), ['due_out', 'to_invoice', 'owed', 'overdue', 'live_value', 'ret_held']);
  assert.deepEqual(setFinTile(o, 2, 'owed'), o);
  assert.deepEqual(o, DEFAULT_FIN_TILES); // the list given is left alone
});

test('due out to suppliers: approved and unpaid, incl. VAT; not paid by hand or on a statement; no subcontract invoices', () => {
  const paid = paidOnStatements([
    { status: 'reconciled', statement_date: '2026-11-01', lines: [{ match: 'p3' }, { match: 'in:x' }] },
    { status: 'open', statement_date: '2026-11-10', lines: [{ match: 'p4', allocated: true }, { match: 'p5' }, { match: 'p6', allocated: true, ignore: true }] },
  ]);
  assert.deepEqual(Object.keys(paid).sort(), ['p3', 'p4']);
  const r = supplierDueOut([
    { id: 'p1', status: 'approved', total: 1200 },
    { id: 'p2', status: 'approved', total: 600, paid_on: '2026-11-02' },
    { id: 'p3', status: 'approved', total: 300 },
    { id: 'p4', status: 'approved', total: 50 },
    { id: 'p5', status: 'approved', total: 100.004 },
    { id: 'p6', status: 'to_approve', total: 240 },
    { id: 'p7', status: 'query', total: 60 },
    { id: 'p8', status: 'rejected', total: 5000 },
    { id: 'p9', status: 'approved', total: 7000, sub_job_id: 'sj1' },
  ], paid);
  assert.deepEqual(r, { due: 1300, dueN: 2, checking: 300, checkingN: 2 });
});
