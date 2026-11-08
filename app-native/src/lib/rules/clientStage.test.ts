/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientCounts, finStatusFor, variationPayable } from './clientStage.ts';

test('only client-approved variations go on an application; older ones as before', () => {
  assert.equal(variationPayable({ approval_status: 'approved', client_status: 'approved' }), true);
  assert.equal(variationPayable({ approval_status: 'approved', client_status: 'issued' }), false);
  assert.equal(variationPayable({ approval_status: 'approved', client_status: 'to_issue' }), false);
  assert.equal(variationPayable({ approval_status: 'approved', client_status: 'rejected' }), false);
  assert.equal(variationPayable({ approval_status: 'pending', client_status: 'approved' }), false);
  assert.equal(variationPayable({ approval_status: 'approved', client_status: null }), true);
});

test('the Finance register status follows the client stage', () => {
  assert.equal(finStatusFor({ approval_status: 'approved', client_status: 'to_issue', cost_impact: '850' }), 'priced');
  assert.equal(finStatusFor({ approval_status: 'pending', client_status: 'to_issue' }), 'instructed');
  assert.equal(finStatusFor({ approval_status: 'approved', client_status: 'issued' }), 'submitted');
  assert.equal(finStatusFor({ approval_status: 'approved', client_status: 'approved' }), 'agreed');
  assert.equal(finStatusFor({ approval_status: 'approved', client_status: 'rejected' }), 'rejected');
  assert.equal(finStatusFor({ approval_status: 'declined', client_status: 'issued' }), 'rejected');
  assert.equal(finStatusFor({ approval_status: 'approved', client_status: null }), 'agreed');
  assert.equal(finStatusFor({ approval_status: 'pending', client_status: null }), 'submitted');
});

test('tile counts', () => {
  assert.deepEqual(clientCounts([{ client_status: 'issued' }, { client_status: null }, { client_status: 'approved' }, { client_status: 'issued' }]), { to_issue: 1, issued: 2, approved: 1, rejected: 0 });
});
