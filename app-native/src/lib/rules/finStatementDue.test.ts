/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stmtBalance, stmtDateFromText } from './finStatementRead.ts';

test('the total due on a statement: under its label, other wordings, the strongest label first', () => {
  assert.equal(stmtBalance('Jewson Ltd\nTotal Due\n£1,234.56\nThank you'), 1234.56);
  assert.equal(stmtBalance('Account 123\nPlease pay   £980.00 by 30 Nov'), 980);
  assert.equal(stmtBalance('Balance b/f 100.00\nTotal Outstanding: 2,500.10'), 2500.1);
  assert.equal(stmtBalance('Closing balance 400.00\nAmount now due 350.00'), 350);
  assert.equal(stmtBalance('Total 12.00\nlines…\nTotal 45.00'), 45);
  assert.equal(stmtBalance('no money here'), null);
});

test('the statement date from its label, else a Date: near the top', () => {
  assert.equal(stmtDateFromText('SIG Trading\nStatement Date: 31/10/2026\n01/10/2026 INV 1 100.00'), '2026-10-31');
  assert.equal(stmtDateFromText('Statement as at\n31 October 2026'), '2026-10-31');
  assert.equal(stmtDateFromText('Customer: RTB\nDate: 30/09/2026'), '2026-09-30');
  assert.equal(stmtDateFromText('01/10/2026 INV 1 100.00'), null);
});
