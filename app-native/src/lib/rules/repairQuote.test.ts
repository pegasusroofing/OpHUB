/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lineValue, parseRates, quoteTotals, rateLine, vatFor } from './repairQuote.ts';

test('a repair quote: schedule of rates less the discount, typed lines in full, VAT once at the bottom', () => {
  const lines = [
    rateLine({ id: 'r1', code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45 }, 4), // 180
    { description: 'Lead flashing (typed in)', qty: 1, rate: 120 },
  ];
  assert.equal(lineValue(lines[0], 10), 162);
  assert.equal(lineValue(lines[1], 10), 120);
  const t = quoteTotals(lines, 10, 'standard');
  assert.deepEqual([t.sorGross, t.discount, t.net, t.vat, t.total], [180, 18, 282, 56.4, 338.4]);
  const rc = quoteTotals(lines, 0, 'reverse_charge');
  assert.deepEqual([rc.net, rc.vat, rc.total], [300, 0, 300]);
  assert.match(rc.vatNote, /reverse charge/);
  assert.equal(vatFor(null).pct, 20);
});

test('rates read from a table: code, description, unit, rate; header skipped', () => {
  const r = parseRates([['Code', 'Description', 'Unit', 'Rate'], ['RF101', 'Replace slipped tile', 'nr', '£45.00'], ['', 'Clear gutters', 'm', 3.5], ['junk']]);
  assert.deepEqual(r, [{ code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45 }, { code: null, description: 'Clear gutters', unit: 'm', rate: 3.5 }]);
});
