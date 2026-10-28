/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dueBadge, effectiveState, latestByItem, type Checkout } from './plant.ts';

const c = (o: Partial<Checkout>): Checkout => ({ id: 'c', plant_item_id: 'p', operative_id: 'u', requested_at: '2026-10-01T09:00:00Z', checkout_status: 'pending_signoff', checkin_status: null, checkin_photo_path: null, checkin_notes: null, ...o });

test('plant due badge', () => {
  const today = new Date('2026-10-28T12:00:00');
  assert.equal(dueBadge({ next_inspection_due: null }, today).tone, 'none');
  assert.equal(dueBadge({ next_inspection_due: '2026-10-01' }, today).tone, 'bad');
  assert.equal(dueBadge({ next_inspection_due: '2026-11-10' }, today).tone, 'warn');
  assert.equal(dueBadge({ next_inspection_due: '2027-03-01' }, today).tone, 'ok');
});

test('plant state', () => {
  const l = latestByItem([c({ id: 'a', requested_at: '2026-10-01T00:00:00Z' }), c({ id: 'b', requested_at: '2026-10-05T00:00:00Z' })]);
  assert.equal(l.p.id, 'b');
  assert.equal(effectiveState({ current_status: 'available' }, c({})), 'pending_checkout_signoff');
  assert.equal(effectiveState({ current_status: 'checked_out' }, c({ checkout_status: 'checked_out', checkin_status: 'pending_signoff' })), 'pending_checkin_signoff');
  assert.equal(effectiveState({ current_status: 'out_of_service' }, undefined), 'out_of_service');
});
