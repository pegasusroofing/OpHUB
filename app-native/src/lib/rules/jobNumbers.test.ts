/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { jobNumberClash, jobNumberError } from './jobNumbers.ts';

const sites = [{ id: 'a', name: 'Studley Rd', job_number: 'RTB-2653' }, { id: 'b', name: 'Ruth House', job_number: ' 2700 ' }, { id: 'c', name: 'No Number', job_number: null }];

test('a number already on another job is caught, ignoring case and spaces', () => {
  assert.equal(jobNumberClash('rtb-2653', sites), 'Studley Rd');
  assert.equal(jobNumberClash('2700', sites), 'Ruth House');
  assert.equal(jobNumberClash('2701', sites), null);
  assert.equal(jobNumberClash('  ', sites), null);
});

test('a job keeping its own number is fine', () => {
  assert.equal(jobNumberClash('RTB-2653', sites, 'a'), null);
  assert.equal(jobNumberClash('RTB-2653', sites, 'b'), 'Studley Rd');
});

test("the database's refusal reads plainly", () => {
  assert.equal(jobNumberError('Job number 2700 is already used on another job'), 'Job number 2700 is already used on another job.');
  assert.equal(jobNumberError('some other error'), null);
});
