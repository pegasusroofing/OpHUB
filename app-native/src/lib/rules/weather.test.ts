/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ukPostcode } from './weather.ts';

test('the postcode is found in a company address (home page weather with no projects yet)', () => {
  assert.equal(ukPostcode('Unit 7, Runwell Hall Farm, Hoe Lane, Rettendon, CM3 8DQ'), 'CM3 8DQ');
  assert.equal(ukPostcode('1 High St\nLondon\nsw1a1aa'), 'SW1A 1AA');
  assert.equal(ukPostcode('No postcode here'), '');
  assert.equal(ukPostcode(null), '');
});
