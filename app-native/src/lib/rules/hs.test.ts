/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canSeeTile, currentCycleSigs, resignCycleStart, resignDue, signedHeadline, signers, tbtAllSigned, unsignedByMe } from './hs.ts';

const live = { status: 'active' }, closed = { status: 'closed' };

test('resignCycleStart prefers resign_cycle_start', () => {
  assert.equal(resignCycleStart({ id: 'a', resign_cycle_start: '2026-01-01', uploaded_at: '2025-01-01' }), '2026-01-01');
  assert.equal(resignCycleStart({ id: 'a', resign_cycle_start: null, uploaded_at: '2025-01-01' }), '2025-01-01');
});

test('resignDue is a year on, live jobs only', () => {
  const d = resignDue({ id: 'a', resign_cycle_start: null, uploaded_at: '2025-03-10T00:00:00Z' }, live);
  assert.equal(d?.getUTCFullYear(), 2026);
  assert.equal(resignDue({ id: 'a', resign_cycle_start: null, uploaded_at: '2025-03-10T00:00:00Z' }, closed), null);
});

test('currentCycleSigs drops pre-cycle signatures on live jobs only', () => {
  const docs = [{ id: 'd', resign_cycle_start: '2026-06-01T00:00:00Z', uploaded_at: '2025-01-01T00:00:00Z' }];
  const sigs = [{ rams_id: 'd', user_id: 'u1', signed_at: '2026-05-01T00:00:00Z' }, { rams_id: 'd', user_id: 'u2', signed_at: '2026-07-01T00:00:00Z' }];
  assert.deepEqual(currentCycleSigs(sigs, docs, 'rams_id', live).map((s) => s.user_id), ['u2']);
  assert.equal(currentCycleSigs(sigs, docs, 'rams_id', closed).length, 2);
});

test('unsignedByMe', () => {
  assert.deepEqual(unsignedByMe([{ id: 'a' }, { id: 'b' }], [{ coshh_id: 'a', user_id: 'me', signed_at: 'x' }], 'coshh_id').map((d) => d.id), ['b']);
});

test('signers: issued lines are not signatures; waiting keeps roster order', () => {
  const r = signers(['a', 'b', 'c'], [
    { user_id: 'pm', signed_at: '2026-01-01', issued: true },
    { user_id: 'c', signed_at: '2026-01-03' },
    { user_id: 'a', signed_at: '2026-01-02' },
  ]);
  assert.deepEqual(r.signed.map((s) => s.user_id), ['a', 'c']);
  assert.deepEqual(r.waiting, ['b']);
});

test('signedHeadline wording', () => {
  assert.equal(signedHeadline(0, 0), '');
  assert.equal(signedHeadline(5, 2), '3 of 5 operatives signed');
  assert.equal(signedHeadline(1, 0), '✓ All 1 operative on this job has signed');
  assert.equal(signedHeadline(4, 0), '✓ All 4 operatives on this job have signed');
});

test('tbtAllSigned needs a roster', () => {
  assert.equal(tbtAllSigned([], []), false);
  assert.equal(tbtAllSigned(['a', 'b'], ['a']), false);
  assert.equal(tbtAllSigned(['a', 'b'], ['b', 'a', 'x']), true);
});

test('canSeeTile: managers always, others by the job setting', () => {
  assert.equal(canSeeTile(null, 'hs_ppe', 'pm'), true);
  assert.equal(canSeeTile(null, 'hs_ppe', 'operative'), true);
  assert.equal(canSeeTile({ tile_visibility: { hs_ppe: ['site_manager'] } }, 'hs_ppe', 'operative'), false);
  assert.equal(canSeeTile({ tile_visibility: { hs_ppe: ['operative'] } }, 'hs_ppe', 'operative'), true);
});
