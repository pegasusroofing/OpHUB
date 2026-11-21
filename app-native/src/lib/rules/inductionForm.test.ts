/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { carryOver, COMPANY_INDUCTION, fromCompanyInduction, fromSignUp, standardInductionForm } from './inductionForm.ts';

test('Induction: next of kin and About You come from the sign-up form (21 Nov 2026)', () => {
  const form = standardInductionForm();
  // The in-app form: operatives as lines, a UK date.
  const a = fromSignUp(form, {
    company_name: 'JT Roofing Ltd', trading_name: '', trades: ['Flat roofing — felt', 'Other'], other_trade: 'Leadwork',
    kin_name: 'Sue Turner', kin_relationship: 'Wife', kin_phone: '07700 900111', kin_address: '',
    operatives: 'Bob Smith — Labourer — 111 — 01/01/2027\nJack Turner — Roofer — 123456 — 5/3/2028',
  }, 'Jack Turner');
  assert.deepEqual(a, { kin_name: 'Sue Turner', kin_relationship: 'Wife', kin_phone: '07700 900111', about_employer: 'JT Roofing Ltd', about_trade: 'Roofer', about_cscs: '123456', about_cscs_expiry: '2028-03-05' });
  // The sign-up page: operatives as a list; the only one listed is theirs; trades when the list has none.
  const b = fromSignUp(form, { company_name: 'X Ltd', trading_name: 'X Roofing', trades: ['Leadwork', 'Other'], other_trade: 'Chimneys', operatives: [{ name: 'Someone Else', trade: '', card: '999', expiry: '2029-01-31' }] }, 'Jack');
  assert.deepEqual(b, { about_employer: 'X Roofing', about_trade: 'Leadwork, Chimneys', about_cscs: '999', about_cscs_expiry: '2029-01-31' });
  // Nothing to go on.
  assert.deepEqual(fromSignUp(form, null, 'Jack'), {});
  assert.deepEqual(fromSignUp(form, { operatives: [{ name: 'A' }, { name: 'B' }] }, 'Jack'), {});
  // A company's own form without an About You section gets only what it asks.
  const own = { sections: form.sections.filter((s) => s.id !== 'about') };
  assert.deepEqual(Object.keys(fromSignUp(own, { kin_name: 'Sue', company_name: 'X' }, 'Jack')), ['kin_name']);
  // Their last induction comes first; the sign-up form fills the gaps.
  const merged = { ...fromSignUp(form, { kin_name: 'Sue', kin_phone: '1', company_name: 'X' }, 'J'), ...carryOver(form, { kin_name: 'Sam', kin_phone: '2' }) };
  assert.equal(merged.kin_name, 'Sam');
  assert.equal(merged.about_employer, 'X');
});

test('Induction: a subcontractor operative\'s company induction fills the site induction, not the ticks or health (21 Nov 2026)', () => {
  const form = standardInductionForm();
  const a = fromCompanyInduction(form, { you_name: 'Jack', kin_name: 'Sue', kin_phone: '0770', about_trade: 'Roofer', about_firstaid: 'yes', med_any: 'no', health_0: 'yes', item_0: true });
  assert.deepEqual(a, { kin_name: 'Sue', kin_phone: '0770', about_trade: 'Roofer', about_firstaid: 'yes' });
  assert.deepEqual(fromCompanyInduction(form, null), {});
  // Nothing financial is asked.
  assert.equal(COMPANY_INDUCTION.sections.flatMap((s) => s.items).some((i) => /utr|vat|bank|cis|insurance/i.test(`${i.id} ${i.label}`)), false);
});
