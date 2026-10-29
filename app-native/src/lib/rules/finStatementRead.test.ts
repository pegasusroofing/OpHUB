/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guessSupplier, parseStmtText, stmtBalance, stmtDate, stmtFromRows } from './finStatementRead.ts';

test('statement text lines: dates, refs, types, signs; balance; supplier guess', () => {
  assert.equal(stmtDate(46300), '2026-10-05'); assert.equal(stmtDate('5th Oct 2026'), '2026-10-05'); assert.equal(stmtDate('31/02/2026'), null);
  assert.deepEqual(parseStmtText('05/10/2026 INV SIG-88231 2,160.00 4,320.00'), { date: '2026-10-05', ref: 'SIG-88231', type: 'invoice', amount: 2160, text: '05/10/2026 INV SIG-88231 2,160.00 4,320.00' });
  assert.equal(parseStmtText('20/10/2026 Payment received BACS 1,000.00')?.amount, -1000);
  assert.equal(parseStmtText('12/10/2026 Credit note CN-00044 (55.20)')?.type, 'credit');
  assert.equal(parseStmtText('Balance brought forward 01/10/2026 500.00'), null);
  assert.equal(stmtBalance('... Balance due: £3,320.00'), 3320);
  assert.equal(guessSupplier('SIG Roofing Supplies statement', ['SIG', 'SIG Roofing', 'Bauder']), 'SIG Roofing');
});

test('statement spreadsheet: by headings (debit / credit columns, Excel dates)', () => {
  const r = stmtFromRows([['Date', 'Reference', 'Type', 'Debit', 'Credit'], [46300, 'SIG-88231', 'Invoice', 2160], [46315, 'PAY-1', 'Payment received', '', 1000], ['', 'Total', '', 2160, 1000]]);
  assert.deepEqual(r.map((l) => [l.date, l.ref, l.type, l.amount]), [['2026-10-05', 'SIG-88231', 'invoice', 2160], ['2026-10-20', 'PAY-1', 'payment', -1000]]);
});
