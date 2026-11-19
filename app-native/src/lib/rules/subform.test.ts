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

test('sign-up form template: nothing saved is the standard form; a saved one keeps the four core questions', async () => {
  const { subTemplate, SUBFORM_SECTIONS } = await import('./subform.ts');
  assert.equal(subTemplate(null), SUBFORM_SECTIONS);
  // A company's form missing Email and Mobile: they're put back, and stay required.
  const t = subTemplate([{ t: 'Main Contact', q: [{ k: 'company_name', l: 'Firm' }, { k: 'contact_name', l: 'Name' }, { k: 'q_x', l: 'Scaffold towers?', type: 'yesno', req: 1 }, { k: 'q_x', l: 'Repeated' }] }]);
  const keys = t[0].q.map((q) => q.k || q.f);
  assert.ok(keys.includes('email') && keys.includes('phone'));
  assert.equal(t[0].q.find((q) => q.k === 'company_name')?.l, 'Firm'); // renamed, still there
  assert.ok(t[0].q.every((q) => !['company_name', 'contact_name', 'email', 'phone'].includes(q.k || '') || (q.core && q.req)));
  assert.equal(keys.filter((k) => k === 'q_x').length, 1); // a repeated key is dropped
  // A new required question counts as missing until answered.
  const d = { data: { company_name: 'A', contact_name: 'B', email: 'b@a.test', phone: '1' }, files: {}, agree: true, signed: 'B' };
  const { subformMissing } = await import('./subform.ts');
  assert.deepEqual([...subformMissing(d, t)], ['q_x']);
  assert.deepEqual([...subformMissing({ ...d, data: { ...d.data, q_x: 'No' } }, t)], []);
});
