/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { supplierConflict, supplierImportRows } from './suppliers.ts';

const list = [{ id: '1', name: 'SIG Roofing' }, { id: '2', name: 'Roofers Merchant' }];

test('same company spelt differently is blocked; similar names warn', () => {
  assert.equal(supplierConflict('sig-roofing', list).blocked?.id, '1');
  assert.equal(supplierConflict('SIG Roofin', list).blocked?.id, '1'); // one letter off
  assert.equal(supplierConflict('SIG', list).warn?.id, '1'); // contained
  assert.deepEqual(supplierConflict('Travis Perkins', list), { blocked: null, warn: null });
  assert.equal(supplierConflict('SIG Roofing', list, '1').blocked, null); // renaming itself
});

test('supplierImportRows reads Name / Email (or A / B), skipping clashes and bad emails', () => {
  const have = [{ id: '1', name: 'SIG Roofing' }];
  const r = supplierImportRows([['Supplier name', 'Email address'], ['SIG roofing', 'a@sig.co'], ['Jewson', 'j@jewson.co'], ['Jewsons', 'x@j.co'], ['No email', 'nope'], ['Travis Perkins', 'tp@tp.co']], have);
  assert.deepEqual(r.found.map((f) => f.name), ['Jewson', 'Travis Perkins']);
  assert.equal(r.dupes, 2); // SIG roofing matches on file; Jewsons is one letter off Jewson from this file
  const plain = supplierImportRows([['Buildbase', 'b@bb.co']], []);
  assert.deepEqual(plain.found, [{ name: 'Buildbase', email: 'b@bb.co' }]);
});
