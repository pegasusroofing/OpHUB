/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { supplierConflict } from './suppliers.ts';

const list = [{ id: '1', name: 'SIG Roofing' }, { id: '2', name: 'Roofers Merchant' }];

test('same company spelt differently is blocked; similar names warn', () => {
  assert.equal(supplierConflict('sig-roofing', list).blocked?.id, '1');
  assert.equal(supplierConflict('SIG Roofin', list).blocked?.id, '1'); // one letter off
  assert.equal(supplierConflict('SIG', list).warn?.id, '1'); // contained
  assert.deepEqual(supplierConflict('Travis Perkins', list), { blocked: null, warn: null });
  assert.equal(supplierConflict('SIG Roofing', list, '1').blocked, null); // renaming itself
});
