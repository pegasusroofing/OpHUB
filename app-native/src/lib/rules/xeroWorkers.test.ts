/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { xeroWorkerMatch, xeroWorkerPatch } from './xeroWorkers.ts';

const rates = {
  'w:1': { id: '1', name: 'Dave Smith Roofing', xero_contact_id: 'X1' },
  'w:2': { id: '2', name: 'Bob Jones', email: 'bob@jones.example' },
  u9: { id: 'r9', user_id: 'u9', xero_employee_id: 'E9' },
};
const people = [{ id: 'u5', name: 'Sam O’Neill', email: 'sam@rtb.example' }, { id: 'u9', name: 'Pat Lee', email: 'pat@rtb.example' }];

test('matches the same Xero record first, then name or email, then an app user', () => {
  assert.deepEqual(xeroWorkerMatch({ kind: 'sub', xero_contact_id: 'X1', name: 'Anything' }, rates, people)?.how, 'linked');
  assert.equal(xeroWorkerMatch({ kind: 'paye', xero_employee_id: 'E9' }, rates, people)?.key, 'u9');
  assert.equal(xeroWorkerMatch({ kind: 'sub', name: 'BOB  jones' }, rates, people)?.key, 'w:2');
  assert.equal(xeroWorkerMatch({ kind: 'sub', name: 'Robert', email: 'Bob@Jones.example' }, rates, people)?.how, 'name');
  const u = xeroWorkerMatch({ kind: 'paye', name: 'Sam O Neill' }, rates, people);
  assert.equal(u?.key, 'u5'); assert.equal(u?.how, 'user');
  assert.equal(xeroWorkerMatch({ kind: 'sub', name: 'Someone New' }, rates, people), null);
});

test('what is saved: CIS only 0/20/30, PAYE is 0% CIS, the day rate with its note', () => {
  const s = xeroWorkerPatch({ kind: 'sub', xero_contact_id: 'X7', cis_rate: 20, vat_registered: true }, 'now');
  assert.equal(s.pay_type, 'subcontractor'); assert.equal(s.cis_rate, 20); assert.equal(s.vat_registered, true); assert.equal(s.xero_contact_id, 'X7');
  assert.equal('cis_rate' in xeroWorkerPatch({ kind: 'sub', cis_rate: 15 }, 'now'), false);
  assert.equal('cis_rate' in xeroWorkerPatch({ kind: 'sub', cis_rate: null }, 'now'), false);
  const p = xeroWorkerPatch({ kind: 'paye', xero_employee_id: 'E1', day_rate: 123.456, rate_note: 'Salary ÷ 260 working days' }, 'now');
  assert.equal(p.pay_type, 'paye'); assert.equal(p.cis_rate, 0); assert.equal(p.day_rate, 123.46); assert.equal(p.rate_note, 'Xero: Salary ÷ 260 working days');
  assert.equal('day_rate' in xeroWorkerPatch({ kind: 'paye' }, 'now'), false);
});
