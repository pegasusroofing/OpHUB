/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanLines, invTotals, issueProblem, treatmentOf } from './finInvoice.ts';

test('VAT per line, rounded per line in whole pence, reverse charge kept apart', () => {
  const t = invTotals([{ amount: 20.1, vat: '5' }, { amount: 1000, vat: '20' }, { amount: 500, vat: 'rc20' }], 'standard');
  assert.equal(t.net, 1520.1); assert.equal(t.vat, 201.01); assert.equal(t.vatDue, 100); assert.equal(t.total, 1721.11); assert.equal(t.mixed, true);
  assert.equal(treatmentOf(t), 'standard');
  assert.equal(treatmentOf(invTotals([{ amount: 100 }], 'reverse_charge')), 'reverse_charge');
  assert.equal(invTotals([{ amount: -0.005, vat: '20' }], 'standard').vat, 0);
});

test('drafts tidy up and say what stops them being issued', () => {
  const lines = cleanLines([{ description: ' Roof ', amount: '£1,000' }, { description: '', amount: '' }], 'zero');
  assert.deepEqual(lines, [{ description: 'Roof', amount: 1000, vat: '0' }]);
  assert.equal(issueProblem({ lines, bill_name: '', issue_date: 'x', due_date: 'y' }), 'Add who the invoice is to.');
  assert.equal(issueProblem({ lines, bill_name: 'A', issue_date: 'x', due_date: 'y' }), null);
});
