/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allocOf, evenSplit, lineNet, lineVat, mainSite, orderSplit, poTotals, siteAmounts, splitProblem, type PoVat } from './poCalc.ts';

const VATS: PoVat[] = [{ code: '20', name: '20% VAT', rate: 20 }, { code: '5', name: '5% VAT', rate: 5 }, { code: '0', name: 'Zero rated', rate: 0 }, { code: 'rc', name: 'Reverse charge', rate: 20, rc: true }];

test('PO lines: qty × rate less discount, 3-decimal rates, to the penny', () => {
  assert.equal(lineNet({ qty: 24, rate: 86.45, disc: 10 }), 1867.32);
  assert.equal(lineNet({ qty: '12', rate: '54.275', disc: '10' }), 586.17);
  assert.equal(lineNet({ qty: 3, rate: 0.335 }), 1.01);
  assert.equal(lineNet({ qty: 1, rate: 100, disc: 150 }), 0); // a discount can't go over 100%
  assert.equal(lineNet({ qty: '', rate: 10 }), 0);
  assert.equal(lineVat({ qty: 1, rate: 1867.32, vat: '20' }, VATS), 373.46);
  assert.equal(lineVat({ qty: 1, rate: 100, vat: 'rc' }, VATS), 0);
});

test('PO totals with several VAT rates add up: VAT by rate = VAT total, net + VAT = total', () => {
  const lines = [
    { qty: 24, rate: 86.45, disc: 10, vat: '20' }, { qty: 12, rate: 54.275, disc: 10, vat: '20' },
    { qty: 7, rate: 3.333, vat: '5' }, { qty: 1, rate: 45, vat: '0' }, { qty: 2, rate: 1250, vat: 'rc' },
  ];
  const t = poTotals(lines, VATS);
  assert.equal(t.net, 1867.32 + 586.17 + 23.33 + 45 + 2500);
  assert.equal(t.vat, 373.46 + 117.23 + 1.17);
  assert.equal(t.total, Math.round((t.net + t.vat) * 100) / 100);
  assert.deepEqual(t.byVat.map((b) => [b.code, b.net, b.vat]), [['20', 2453.49, 490.69], ['5', 23.33, 1.17], ['0', 45, 0], ['rc', 2500, 0]]);
  assert.equal(Math.round(t.byVat.reduce((s, b) => s + b.vat, 0) * 100) / 100, t.vat);
  assert.equal(Math.round(t.byVat.reduce((s, b) => s + b.net, 0) * 100) / 100, t.net);
});

test('splits: across the whole order or one line, always adding up', () => {
  assert.equal(splitProblem([{ site_id: 'a', pct: 50 }, { site_id: 'b', pct: 30 }]), 'The split adds up to 80% — it needs to be 100%.');
  assert.equal(splitProblem([{ site_id: 'a', pct: 50 }, { site_id: 'a', pct: 50 }]), 'The same project is on two rows — put them together.');
  assert.equal(splitProblem(evenSplit(['a', 'b', 'c'])), null);
  assert.deepEqual(evenSplit(['a', 'b', 'c']).map((x) => x.pct), [33.33, 33.33, 33.34]);
  // the whole order split three ways; one line split on its own; pennies never go missing
  const order = evenSplit(['a', 'b', 'c']);
  const lines = [{ qty: 1, rate: 100, site_id: 'a' }, { qty: 1, rate: 10, site_id: 'a', alloc: [{ site_id: 'd', pct: 50 }, { site_id: 'e', pct: 50 }] }];
  assert.deepEqual(allocOf(lines[0], order), order);
  const by = siteAmounts(lines, order);
  assert.deepEqual(by, { a: 33.33, b: 33.33, c: 33.34, d: 5, e: 5 });
  assert.equal(Object.values(by).reduce((s, v) => s + v, 0), 110);
  const sp = orderSplit(lines, order)!;
  assert.equal(Math.round(sp.reduce((s, x) => s + x.pct, 0) * 10000) / 10000, 100);
  assert.equal(Math.round(sp.reduce((s, x) => s + x.amount, 0) * 100) / 100, 110);
  assert.equal(orderSplit([{ qty: 1, rate: 5, site_id: 'a' }]), null);
  assert.equal(mainSite([{ qty: 1, rate: 5, site_id: 'a' }, { qty: 1, rate: 9, site_id: 'b' }]), 'b');
});
