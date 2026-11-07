/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dueFromPriority, dueLabel, dueOf, isOverdue } from './repairDue.ts';

const from = '2026-11-06T09:00:00Z'; // a Friday
const iso = (d: Date | null) => (d ? d.toISOString() : null);

test('due dates from the priority: its own time, else emergency 24 hours, urgent 7 days, routine 28 days', () => {
  assert.equal(iso(dueFromPriority('7 Days', from)), '2026-11-13T09:00:00.000Z');
  assert.equal(iso(dueFromPriority('24 hours', from)), '2026-11-07T09:00:00.000Z');
  assert.equal(iso(dueFromPriority('4 Hrs', from)), '2026-11-06T13:00:00.000Z');
  assert.equal(dueFromPriority('3 Working Days', from)?.getDay(), 3); // Fri + 3 working days = Wed
  assert.equal(iso(dueFromPriority('Emergency', from)), '2026-11-07T09:00:00.000Z');
  assert.equal(iso(dueFromPriority('Urgent', from)), '2026-11-13T09:00:00.000Z');
  assert.equal(iso(dueFromPriority('Routine', from)), '2026-12-04T09:00:00.000Z');
  assert.equal(dueFromPriority('', from), null);
  assert.equal(dueFromPriority('Whenever', from), null);
});

test('a date set on the job wins; overdue and the label', () => {
  const now = new Date('2026-11-16T09:00:00Z');
  assert.equal(iso(dueOf({ due_at: '2026-11-20T17:00:00Z', priority: 'Emergency', created_at: from })), '2026-11-20T17:00:00.000Z');
  assert.equal(isOverdue({ priority: '7 Days', created_at: from }, now), true);
  assert.equal(isOverdue({ priority: 'Routine', created_at: from }, now), false);
  assert.equal(dueLabel({ priority: '7 Days', created_at: from }, now), 'Overdue 3 Days');
  assert.match(dueLabel({ priority: 'Routine', created_at: from }, now), /^Due 4 Dec$/);
  assert.equal(dueLabel({ created_at: from }, now), '');
});
