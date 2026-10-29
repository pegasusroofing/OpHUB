/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { subformMissing } from './subform.ts';

test('subcontractor form: required answers, files, conditional detail, email and declaration', () => {
  const full = {
    data: { company_name: 'Acme Roofing', company_type: 'Sole trader', cis_status: '20% deduction', address: '1 Road', postcode: 'AB1 2CD', contact_name: 'Dan', email: 'dan@acme.test', phone: '07700', trades: ['Leadwork'], pl_cover: '£5 million', pl_expiry: '2027-01-01', hs_policy: 'Yes', rams_ability: 'Yes', riddor: 'No', enforcement: 'No' },
    files: { 'Public liability certificate': [{ name: 'pl.pdf', path: 'x' }] }, agree: true, signed: 'Dan',
  };
  assert.deepEqual([...subformMissing(full)], []);
  assert.deepEqual([...subformMissing({ ...full, files: {}, agree: false, data: { ...full.data, trades: [], email: 'nope' } })].sort(), ['Public liability certificate', '__agree', 'email', 'trades']);
  // A "Yes" answer doesn't make its detail box required (it isn't marked required).
  assert.deepEqual([...subformMissing({ ...full, data: { ...full.data, riddor: 'Yes' } })], []);
});
