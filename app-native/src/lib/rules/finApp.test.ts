/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appCalc, certInvoiceLines, groupTotals, itemValue, previousCertified } from './finApp.ts';

test('valuation: discount before retention, retention limit, less previous', () => {
  const app = { lines: [{ kind: 'section' }, { value: 10000, pct: 50 }, { value: 2000, pct: '100' }], variations: [{ value: 1000, pct: 50 }], dayworks: [{ value: 250 }], discount_pct: 2.5, retention_pct: 5 };
  const c = appCalc(app, 20000, 3, 1000);
  assert.equal(c.gross, 7750); assert.equal(c.discount, 193.75); assert.equal(c.afterDisc, 7556.25);
  assert.equal(c.retention, 377.81); assert.equal(c.net_due, 6178.44);
  assert.equal(appCalc(app, 5000, 3, 0).retention, 150);
  assert.equal(itemValue({ qty: 12.5, rate: 40 }), 500); assert.equal(itemValue({ value: '£300' }), 300);
});

test('previous certified, section totals and certificate invoice lines', () => {
  assert.equal(previousCertified([{ number: 1, status: 'invoiced', cert_net: 900, net_due: 1000 }, { number: 2, status: 'submitted', net_due: 500 }, { number: 3, status: 'draft', net_due: 9 }], 3), 1400);
  const t = groupTotals([{ kind: 'section' }, { kind: 'subsection' }, { v: 10, g: 5 }, { kind: 'section' }, { v: 3, g: 3 }], (r) => r.v, (r) => r.g);
  assert.deepEqual(t[0], { value: 10, gross: 5 }); assert.deepEqual(t[3], { value: 3, gross: 3 });
  const L = certInvoiceLines({ number: 2, cert_gross: 5000, cert_retention: 250, cert_previous: 1000, cert_discount: 0 }, (d) => d);
  assert.deepEqual(L.map((l) => l.amount), [5000, -250, -1000]);
});
