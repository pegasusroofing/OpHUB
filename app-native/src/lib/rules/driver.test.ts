/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectionKind, collectionLine, continuations, dayTotals, dtoDays, dtoProblem, groupCollections, hasFails, minsLabel,
  nextSlotKey, nextWorkingDay, pushSlot, resequence, slotProblem, vehicleSubmitProblem, VEHICLE_ITEMS, VEHICLE_PHOTOS, weekStart,
  type DTask, type VItem,
} from './driver.ts';

const place = (t: DTask) => t.manual_site_name || 'Site';
const T = (id: string, time_slot: string, extra: Partial<DTask> = {}): DTask => ({ id, site_id: null, time_slot, status: 'pending', manual_site_name: id, ...extra });

test('nextSlotKey', () => {
  assert.equal(nextSlotKey('7am'), '8am');
  assert.equal(nextSlotKey('5pm'), null);
});

test('slotProblem: 2-drop bookings block the next drop', () => {
  const day = [T('A', '9am', { double_slot: true })];
  assert.match(slotProblem(day, { id: 'n', double_slot: false }, '10am', place), /4th drop is taken by A \(extra time from the 3rd drop\)/);
  assert.match(slotProblem(day, { id: 'n', double_slot: false }, '9am', place), /3rd drop is taken by A \(needs extra time — 2 drops\)/);
  assert.equal(slotProblem(day, { id: 'n', double_slot: false }, '11am', place), '');
  assert.match(slotProblem([T('B', '8am')], { id: 'n', double_slot: true }, '7am', place), /also takes the 2nd drop — move B/);
  assert.match(slotProblem([], { id: 'n', double_slot: true }, '5pm', place), /can't go in the last drop/);
  assert.equal(slotProblem([T('C', '9am', { double_slot: true, status: 'cancelled' })], { id: 'n' }, '10am', place), '');
});

test('continuations', () => {
  assert.deepEqual(continuations([T('A', '9am', { double_slot: true }), T('B', '9am')], '10am').map((t) => t.id), ['A']);
});

test('nextWorkingDay skips weekends and starts from the later of today/scheduled', () => {
  assert.equal(nextWorkingDay('2026-10-30', '2026-10-28'), '2026-11-02'); // Fri -> Mon
  assert.equal(nextWorkingDay('2026-10-20', '2026-10-28'), '2026-10-29'); // past -> tomorrow
});

test('pushSlot: 1st drop kept if free, else from 2pm, else anything', () => {
  const t = T('X', '7am', { high_priority: true });
  assert.equal(pushSlot([], t, true, place), '7am');
  assert.equal(pushSlot([], t, false, place), '2pm');
  const busy = ['2pm', '3pm', '4pm', '5pm'].map((k) => T(k, k, { double_slot: true }));
  assert.equal(pushSlot(busy, T('Y', '9am'), false, place), '7am');
});

test('resequence: 1st drop first, single row gets null', () => {
  assert.deepEqual(resequence([T('a', '7am')]), { a: null });
  const r = resequence([T('a', '7am', { sub_priority: 1 }), T('b', '7am', { high_priority: true, sub_priority: 2 })]);
  assert.deepEqual(r, { b: 1, a: 2 });
});

test('collections: kinds, lines and grouping', () => {
  assert.equal(collectionKind({ ...T('a', '7am'), collection_type: 'manual', collection_address_manual: ' No collection ' }), 'none');
  assert.equal(collectionLine({ ...T('a', '7am'), collection_type: 'manual', collection_address_manual: 'Clear site' }), '🧹 Clear site');
  assert.equal(collectionLine({ ...T('a', '7am'), collection_type: 'yard' }), '📦 Collect from: YARD');
  const g = groupCollections([
    T('s', '9am', { collection_type: 'supplier', supplier_id: 'x' }),
    T('y', '8am', { collection_type: 'yard' }),
    T('n', '7am', { collection_type: 'manual', collection_address_manual: 'No collection' }),
    T('h', '10am', { collection_type: 'supplier', supplier_id: 'x', high_priority: true }),
  ], () => 'SIG');
  assert.deepEqual(g.map((p) => p.key), ['supplier:x', 'yard']);
  assert.deepEqual(g[0].tasks.map((t) => t.id), ['h', 's']);
  assert.equal(g[0].label, 'SIG');
});

test('dayTotals and minsLabel', () => {
  const day = '2026-10-27';
  const r = dayTotals(
    [{ type: 'in', ts: `${day}T07:00:00` }, { type: 'out', ts: `${day}T16:00:00` }],
    [{ started_at: `${day}T12:00:00`, ended_at: `${day}T12:30:00` }], day, new Date('2026-10-28T10:00:00'));
  assert.deepEqual([r.duty, r.brk, r.worked, r.count], [540, 30, 510, 1]);
  assert.equal(minsLabel(510), '8h 30m');
  const open = dayTotals([{ type: 'in', ts: `${day}T07:00:00` }], [], day, new Date('2026-10-28T10:00:00'));
  assert.equal(open.noCheckout, true);
});

test('time off', () => {
  assert.equal(dtoDays('2026-11-02', '2026-11-06'), 5);
  assert.equal(dtoProblem('2026-11-02', '2026-11-01', '2026-10-28'), 'The “To” date must be on or after the “From” date.');
  assert.equal(dtoProblem('2026-10-27', '2026-10-27', '2026-10-28'), 'Pick today or a later date.');
  assert.equal(dtoProblem('2026-10-28', '2026-10-28', '2026-10-28'), '');
});

test('vehicle checklist: week start and submit checks in the old order', () => {
  assert.equal(weekStart(new Date('2026-10-28T10:00:00')), '2026-10-26');
  assert.equal(weekStart(new Date('2026-11-01T10:00:00')), '2026-10-26'); // Sunday
  const items: Record<string, VItem> = {};
  assert.match(vehicleSubmitProblem('AB12', 100, items), /Pass or Fail/);
  VEHICLE_ITEMS.forEach((i) => { items[i.key] = { key: i.key, result: 'pass' }; });
  assert.match(vehicleSubmitProblem('', 100, items), /registration/);
  assert.match(vehicleSubmitProblem('AB12', '', items), /mileage/);
  assert.match(vehicleSubmitProblem('AB12', '48,250', items), /missing: Front/);
  VEHICLE_PHOTOS.forEach((p) => { items[p.key] = { key: p.key, photo_path: 'x' }; });
  assert.equal(vehicleSubmitProblem('AB12', '48,250', items), '');
  items.horn = { key: 'horn', result: 'fail', note: 'broken' };
  assert.match(vehicleSubmitProblem('AB12', 1, items), /photo and a note/);
  assert.equal(hasFails(items), true);
});
