/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkAgainstPo, likeness, matchItem, netUnit } from './poMatch.ts';

const PO = [
  { item: 'K4E capsheet 7.5m', qty: 24, rate: 77.805, amount: 1867.32 },
  { item: 'BauderTEC DBR 06 underlay', qty: 12, rate: 48.848, amount: 586.17 },
  { item: 'Type 3 trim GRP 3m', qty: 40, rate: 7.71, amount: 308.4 },
];

test('matching an invoice line to its PO line', () => {
  assert.ok(likeness('Bauder K4E capsheet 7.5m roll', 'K4E capsheet 7.5m') >= 0.99);
  assert.equal(matchItem({ description: 'Bauder K4E Capsheet 7.5m' }, PO), 0);
  assert.equal(matchItem({ description: 'DBR 06 underlay (BauderTEC)' }, PO), 1);
  assert.equal(matchItem({ description: 'Pallet charge' }, PO), -1);
  assert.equal(netUnit({ qty: 24, unit_price: 86.45, disc: 10 }), 77.805);
  assert.equal(netUnit({ qty: 4, amount: 10 }), 2.5);
});

test('an invoice that matches its PO: no flags', () => {
  const r = checkAgainstPo([{ description: 'K4E capsheet 7.5m', qty: 24, unit_price: 86.45, disc: 10, amount: 1867.32 }, { description: 'Type 3 trim GRP', qty: 40, unit_price: 7.71, amount: 308.4 }], PO, 'J101-PO-014');
  assert.deepEqual(r.perLine.map((x) => x.state), ['ok', 'ok']);
  assert.deepEqual(r.flags, []);
});

test('dearer, more than ordered, not on the PO → flags; cheaper → a note only', () => {
  const r = checkAgainstPo([
    { description: 'K4E capsheet 7.5m', qty: 24, unit_price: 80, amount: 1920 },
    { description: 'BauderTEC DBR 06 underlay', qty: 14, unit_price: 48.848, amount: 683.87 },
    { description: 'Delivery charge', qty: 1, unit_price: 45, amount: 45 },
    { description: 'Type 3 trim GRP 3m', qty: 40, unit_price: 7.5, amount: 300 },
    { description: 'Invoice total', kind: 'total', amount: 2948.87 },
  ], PO, 'J101-PO-014');
  assert.deepEqual(r.perLine.map((x) => x.state), ['dearer', 'more', 'missing', 'cheaper', 'none']);
  assert.equal(r.flags.length, 3);
  assert.equal(r.notes.length, 1);
  assert.match(r.flags[0], /£80\.00 each, J101-PO-014 says £77\.805/);
});

test('a PO with no item lines (just a value) gives no line checks', () => {
  const r = checkAgainstPo([{ description: 'Anything', qty: 1, unit_price: 5, amount: 5 }], [], 'PO');
  assert.deepEqual(r.flags, []);
  assert.deepEqual(r.perLine.map((x) => x.state), ['none']);
});
