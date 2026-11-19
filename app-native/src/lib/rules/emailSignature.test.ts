/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addFillIn, signatureGaps, signatureParts } from './emailSignature.ts';

test('a fill-in goes where the cursor is, spaced from the words either side', () => {
  assert.deepEqual(addFillIn('Hello,\n\nKind regards,', '{my_name}', { start: 6, end: 6 }), { text: 'Hello, {my_name}\n\nKind regards,', sel: { start: 16, end: 16 } });
  assert.equal(addFillIn('Invoice — ', '{project}').text, 'Invoice — {project}');
  assert.equal(addFillIn('Invoice for', '{project}').text, 'Invoice for {project}');
  assert.equal(addFillIn('Dear  team', '{client}', { start: 5, end: 5 }).text, 'Dear {client} team');
  assert.equal(addFillIn('for job', '{project}', { start: 4, end: 7 }).text, 'for {project}');
  assert.equal(addFillIn('', '{project}').text, '{project}');
  assert.equal(addFillIn('(', '{job_no}').text, '({job_no}');
});

test('the signature is filled in from what is known, blanks left out', () => {
  const p = signatureParts({ name: 'Andy Cramp', phone: '07700 900000', email: 'andy@example.co.uk', company: 'RTB Construction Group', address: 'Unit 1,\n Some Road\nTown', tel: '01234 567890', regNo: '123', vatNo: '' }, true);
  assert.equal(p.contact, '07700 900000 · andy@example.co.uk');
  assert.equal(p.address, 'Unit 1, Some Road, Town');
  assert.equal(p.tel, 'Tel: 01234 567890');
  assert.equal(p.numbers, 'Company No. 123');
  assert.equal(signatureParts({ name: 'A', regNo: '123' }).numbers, '', 'company numbers only on Finance emails');
  assert.deepEqual(signatureGaps({ name: 'A', phone: '1', address: 'x', tel: '' }), ['the company phone']);
});
