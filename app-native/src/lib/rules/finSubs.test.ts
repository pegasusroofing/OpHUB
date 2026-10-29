/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { opCalc, subAppCalc } from './finSubs.ts';

test('subcontractor certificate: retention, contra not reducing CIS, pay less', () => {
  const c = subAppCalc({ applied: 12000, mat: 2000, cert: 10000, contra: 500, retentionPct: 5, cisRate: 20, prevNet: 3000, prevM: 500, prevContra: 100 });
  assert.equal(c.retention, 500); assert.equal(c.net, 6000); assert.equal(c.contraNow, 400);
  assert.equal(c.labour, 4900); assert.equal(c.cis, 980); assert.equal(c.pay, 5020); assert.equal(c.payless, true);
  assert.equal(subAppCalc({ applied: 1, mat: 0, cert: null, contra: 0, retentionPct: 0, cisRate: 20, prevNet: 0, prevM: 0, prevContra: 0 }).cert, null);
});

test('operative invoice CIS on labour only', () => {
  assert.deepEqual(opCalc([{ amount: 600 }, { amount: '400' }], 150, 20), { labour: 1000, materials: 150, gross: 1150, cis_rate: 20, cis_deduction: 200, net_pay: 950 });
});
