/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { poGoesToOneDrive } from './jobPack.ts';

test('POs go to OneDrive only at or above the company minimum (excl. VAT)', () => {
  assert.equal(poGoesToOneDrive(120, undefined), true, 'no minimum: every PO');
  assert.equal(poGoesToOneDrive(120, 0), true);
  assert.equal(poGoesToOneDrive(499.99, 500), false);
  assert.equal(poGoesToOneDrive(500, 500), true);
  assert.equal(poGoesToOneDrive(null, 500), false);
});
