/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cap1, currentPpe } from './ppe.ts';

test('currentPpe: only signed, mine, de-duplicated, A–Z', () => {
  const rows = [
    { id: '1', user_id: 'me', items: ['Hard Hat', 'Gloves'], status: 'signed', issued_at: '2026-01-01' },
    { id: '2', user_id: 'me', items: ['Gloves', 'Dust Mask'], status: 'signed', issued_at: '2026-02-01' },
    { id: '3', user_id: 'me', items: ['Hi-Vis Vest'], status: 'pending_signature', issued_at: '2026-03-01' },
    { id: '4', user_id: 'other', items: ['Safety Boots'], status: 'signed', issued_at: '2026-03-01' },
  ];
  assert.deepEqual(currentPpe(rows, 'me'), ['Dust Mask', 'Gloves', 'Hard Hat']);
});

test('cap1', () => {
  assert.equal(cap1('fulfilled'), 'Fulfilled');
  assert.equal(cap1(''), '');
});
