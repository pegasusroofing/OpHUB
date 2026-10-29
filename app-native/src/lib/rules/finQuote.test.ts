/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { linesFromRows, linesFromText, matchLines } from './finQuote.ts';

test('quote lines from PDF text and a spreadsheet; matched to PO items by words', () => {
  const t = linesFromText('SIG ROOFING QUOTATION\nBAT25 Treated batten 25x50 100 m 0.62 62.00\nCode 4 lead 300mm 2 roll 85.50 171.00\nDelivery 1 25.00 25.00\nSub total 258.00');
  assert.deepEqual(t.map((l) => [l.description, l.qty, l.unit_price, l.kind]), [['Treated batten 25x50', 100, 0.62, 'item'], ['Code 4 lead 300mm', 2, 85.5, 'item'], ['Delivery', 1, 25, 'delivery']]);
  const s = linesFromRows([['Quote 123'], ['Product', 'Qty', 'Unit', 'Price', 'Total'], ['Felt underlay 1x50m', 4, 'roll', 32.5, 130], ['Total', '', '', '', 130]]);
  assert.deepEqual(s.map((l) => [l.description, l.qty, l.unit_price]), [['Felt underlay 1x50m', 4, 32.5]]);
  const m = matchLines([{ item: 'Code 4 lead 300mm x 6m' }, { item: 'Batten 25x50' }, { item: 'Ridge tiles' }], t);
  assert.deepEqual(m, { 0: 1, 1: 0 });
});
