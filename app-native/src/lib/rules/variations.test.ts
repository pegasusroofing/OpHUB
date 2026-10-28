/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { financeValuePatch, money, readMoney, valueOf } from './variations.ts';

test('readMoney', () => {
  assert.equal(readMoney(''), null);
  assert.equal(readMoney('£1,250.505'), 1250.51);
  assert.ok(Number.isNaN(readMoney('abc') as number));
});

test('valueOf and money', () => {
  assert.equal(valueOf(null), null);
  assert.equal(valueOf('850.00'), 850);
  assert.equal(money(1250.5), '£1,250.50');
  assert.equal(money(-20), '−£20.00');
});

test('financeValuePatch only follows where Finance has not typed its own figure', () => {
  assert.equal(financeValuePatch({ status: 'quoted', quoted: 900, agreed_value: null }, 800, 850), null); // Finance changed it
  assert.deepEqual(financeValuePatch({ status: 'quoted', quoted: 800, agreed_value: null }, 800, 850), { quoted: 850 });
  assert.deepEqual(financeValuePatch({ status: 'agreed', quoted: null, agreed_value: 800 }, 800, 850), { quoted: 850, agreed_value: 850 });
  assert.equal(financeValuePatch({ status: 'quoted', quoted: 850, agreed_value: null }, 800, 850), null); // already the same
  assert.equal(financeValuePatch({ status: 'quoted', quoted: null, agreed_value: null }, 800, null), null);
});
