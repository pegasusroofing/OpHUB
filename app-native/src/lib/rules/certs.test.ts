/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CERT_CATEGORIES_AZ, certDisplayName, certPath, certStats, matrixState, trainingMatrix } from './certs.ts';

test('categories A–Z with Other last', () => {
  assert.equal(CERT_CATEGORIES_AZ[0].label, 'Asbestos Awareness');
  assert.equal(CERT_CATEGORIES_AZ[CERT_CATEGORIES_AZ.length - 1].key, 'other');
});

test('certStats: expired, expiring in 30 days, missing standard types', () => {
  const now = new Date(2026, 9, 28);
  const s = certStats([
    { category: 'cscs_card', expiry_date: '2026-10-01' },
    { category: 'manual_handling', expiry_date: '2026-11-20' },
    { category: 'smsts', expiry_date: '2027-06-01' },
    { category: 'other', expiry_date: null },
  ], now);
  assert.deepEqual([s.total, s.expired, s.expiringSoon, s.missing], [4, 1, 1, 2]);
  assert.deepEqual(s.missingKeys, ['working_at_height', 'asbestos_awareness']);
});

test('certDisplayName and certPath', () => {
  assert.equal(certDisplayName({ name: 'My CSCS', storage_path: 'x' }), 'My CSCS');
  assert.equal(certDisplayName({ name: null, storage_path: 'o/u/0f8fad5b-d9cb-469f-a165-70867728950e-CSCS%20card.pdf' }), 'CSCS card.pdf');
  assert.equal(certPath('o', 'u', 'id', 'CSCS card (front).jpg'), 'o/u/id-CSCS_card_front_.jpg');
});

test('trainingMatrix: count and soonest expiry; matrixState', () => {
  const m = trainingMatrix([{ operative_id: 'a', category: 'smsts', expiry_date: '2027-05-01' }, { operative_id: 'a', category: 'smsts', expiry_date: '2026-11-10' }, { operative_id: 'a', category: 'cscs_card', expiry_date: null }]);
  assert.deepEqual(m.a.smsts, { count: 2, expiry: '2026-11-10' });
  const now = new Date('2026-11-01T09:00:00');
  assert.equal(matrixState(m.a.smsts, now), 'soon'); assert.equal(matrixState(m.a.cscs_card, now), 'ok'); assert.equal(matrixState(undefined, now), 'none'); assert.equal(matrixState({ count: 1, expiry: '2026-10-01' }, now), 'expired');
});
