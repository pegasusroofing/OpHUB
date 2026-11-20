/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { insuranceStatus, libCategory, parseExpiry } from './subLibrary.ts';

test('sign-up documents go under the right library heading', () => {
  assert.equal(libCategory('Public Liability Insurance certificate'), 'public_liability_insurance');
  assert.equal(libCategory("Employer's Liability"), 'employers_liability_insurance');
  assert.equal(libCategory('CSCS card - Dan'), 'operative_certificate');
  assert.equal(libCategory('CHAS certificate'), 'accreditation');
  assert.equal(libCategory('Bank letter'), 'other');
});

test('expiry dates as typed on the form', () => {
  assert.equal(parseExpiry('2027-03-12'), '2027-03-12');
  assert.equal(parseExpiry('12/03/2027'), '2027-03-12');
  assert.equal(parseExpiry('12.3.27'), '2027-03-12');
  assert.equal(parseExpiry('12th March 2027'), '2027-03-12');
  assert.equal(parseExpiry('Mar 2027'), '2027-03-28');
  assert.equal(parseExpiry('soon'), null);
  assert.equal(parseExpiry(''), null);
});

test('insurance: in date, expired, missing', () => {
  const today = '2026-11-20';
  const pl = (e: string | null) => ({ category: 'public_liability_insurance', expiry_date: e });
  const el = (e: string | null) => ({ category: 'employers_liability_insurance', expiry_date: e });
  const good = insuranceStatus([pl('2027-05-01'), el('2027-03-12')], today);
  assert.equal(good.ok, true); assert.equal(good.label, '✓ Insurance valid to 12 Mar 2027');
  const old = insuranceStatus([pl('2026-10-01'), pl('2027-10-01'), el('2026-10-31')], today);
  assert.equal(old.ok, false); assert.equal(old.warn, "Employer's liability insurance expired 31 Oct 2026", 'the newest PL certificate counts');
  const none = insuranceStatus([], today);
  assert.equal(none.label, "⚠ No public liability insurance on file; no employer's liability insurance on file");
  assert.equal(insuranceStatus([pl(null), el(null)], today).label, '✓ Insurance on file');
});
