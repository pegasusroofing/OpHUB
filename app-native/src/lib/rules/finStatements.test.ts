/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoMatch, lineState, refKey, sameSupplier, type Cand } from './finStatements.ts';

test('statement lines match by number, then by amount, keeping hand matches', () => {
  assert.equal(refKey('INV-00123'), '123'); assert.equal(sameSupplier('Bauder Ltd', 'BAUDER'), true);
  const c: Cand[] = [{ id: 'a', kind: 'pi', invoice_no: 'INV123', date: '2026-01-02', total: 100, status: 'approved' }, { id: 'b', kind: 'pi', invoice_no: '', date: '2026-01-05', total: 250, status: 'approved' }, { id: 'c', kind: 'pi', invoice_no: '999', date: '2026-01-05', total: 75, status: 'approved' }];
  const L = autoMatch([{ id: '1', ref: '00123', type: 'invoice', amount: 100 }, { id: '2', ref: '', date: '2026-01-06', type: 'invoice', amount: 250 }, { id: '3', ref: 'x', type: 'payment', amount: -350 }, { id: '4', ref: '555', type: 'invoice', amount: 75 }, { id: '5', ref: '', type: 'invoice', amount: 75, match: 'c', how: 'manual' }], c);
  assert.deepEqual(L.map((l) => l.match ?? null), ['a', 'b', null, null, 'c']);
  assert.equal(lineState(L[3], c).k, 'missing'); assert.equal(lineState(L[2], c).k, 'payment'); assert.equal(lineState({ ...L[0], amount: 110 }, c).k, 'diff');
});
