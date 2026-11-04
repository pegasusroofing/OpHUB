/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { batchNames, daysOut, dueBadge, effectiveState, latestByItem, type Checkout } from './plant.ts';

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

test('plant two-way signing states, days out and batch names', () => {
  assert.equal(effectiveState({ current_status: 'available' }, c({ checkout_status: 'pending_signoff', allocated_at: '2026-11-04T09:00:00Z' })), 'awaiting_op');
  assert.equal(effectiveState({ current_status: 'out_of_service', lost_at: '2026-11-04T09:00:00Z' }, c({ checkout_status: 'checked_out' })), 'lost');
  assert.equal(daysOut(c({ checkout_status: 'checked_out', op_signed_at: '2026-11-01T09:00:00Z' }), new Date('2026-11-04T10:00:00Z')), 3);
  assert.equal(daysOut(c({ checkout_status: 'checked_out', checkin_status: 'returned' })), null);
  assert.deepEqual(batchNames('Propane 47kg', 3), ['Propane 47kg #01', 'Propane 47kg #02', 'Propane 47kg #03']);
  assert.deepEqual(batchNames('Cage', 1), ['Cage']);
  assert.equal(batchNames('Cylinder', 120)[119], 'Cylinder #120');
});
