/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, appDateFor, appDueThisMonth, finBlocked, FIN_TRIAL, invOutstandingNet, invOverdue, money, num, plantCost, retentionAlerts, retentionStillHeld, retHalf, retHalfAmt } from './finance.ts';

test('trial blocks everything that leaves Finance, except the sandbox and Directory contacts', () => {
  assert.equal(FIN_TRIAL, true);
  assert.equal(finBlocked('send-finance-email', undefined, 'rtb'), true);
  assert.equal(finBlocked('xero', 'post_invoice', 'rtb'), true);
  assert.equal(finBlocked('xero', 'customers', 'rtb'), false);
  assert.equal(finBlocked('finance-inbox', undefined, '2eb072b7-2704-48c0-8110-62e45e621ded'), false);
  assert.equal(finBlocked('send-document-email', undefined, 'rtb'), false);
});

test('money, amounts and dates', () => {
  assert.equal(money(-1234.5), '−£1,234.50'); assert.equal(money(null), '—'); assert.equal(money(1000, 0), '£1,000');
  assert.equal(num('£1,250'), 1250); assert.equal(num(''), null); assert.ok(isNaN(num('x') as number));
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('owed, overdue and retention', () => {
  const inv = { id: 'i', site_id: 's', status: 'part_paid', total: 1200, paid: 600, net: 1000, due_date: '2026-01-01' };
  assert.equal(invOutstandingNet(inv), 500); assert.equal(invOverdue(inv, '2026-02-01'), true);
  const apps = [{ number: 1, status: 'certified', cert_retention: 500 }, { number: 2, status: 'certified', cert_retention: 900 }];
  assert.equal(retentionStillHeld(apps, { ret1_invoice_id: 'r1' }, [{ id: 'r1', site_id: 's', status: 'issued', net: 450 }]), 450);
  assert.equal(retHalf(901, 1), 450.5); assert.equal(retHalf(901, 2), 450.5);
  assert.deepEqual(retentionAlerts({ pc_date: '2026-03-01' }, {}, 900, '2026-02-15'), [{ half: 1, date: '2026-03-01' }]);
});

test('application dates and plant hire', () => {
  assert.equal(appDateFor({ app_reminder_day: 31 }, {}, '2026-02'), '2026-02-28');
  assert.equal(appDueThisMonth([], '2026-02-25', '2026-02-26'), true);
  assert.equal(appDueThisMonth([{ number: 1, status: 'draft', valuation_date: '2026-02-20' }], '2026-02-25', '2026-02-26'), false);
  assert.deepEqual(plantCost({ on_hire: '2026-01-01', off_hire: '2026-01-14', rate: 70, rate_period: 'week' }), { days: 14, weeks: 2, cost: 140 });
});

test('retention halves come from what the certificate holds, not what is still held (903 finRetHalfAmt)', () => {
  const apps = [{ number: 1, status: 'certified', cert_retention: 1000 }] as never[];
  // Nothing invoiced yet: half each.
  assert.equal(retHalfAmt(1000, 1, {} as never, [], apps), 500); assert.equal(retHalfAmt(1000, 2, {} as never, [], apps), 500);
  // First half invoiced at £500: the first half is that invoice, the second is what's held less it.
  const jf = { ret1_invoice_id: 'r1' } as never, invs = [{ id: 'r1', status: 'sent', net: 500 }] as never[];
  assert.equal(retHalfAmt(1000, 1, jf, invs, apps), 500); assert.equal(retHalfAmt(1000, 2, jf, invs, apps), 500);
});
