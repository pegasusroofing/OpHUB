/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, expiringDocs, HR_CHECKLIST, itemState, itemsFor, nextAppraisal, type Appraisal, type HrDoc } from './hrRecords.ts';

const doc = (o: Partial<HrDoc>): HrDoc => ({ id: 'd', org_id: 'o', user_id: 'u', folder: 'rtw', item_key: null, title: 't', file_name: null, storage_path: 'p', doc_date: null, expiry_date: null, hidden_from_employee: false, uploaded_by: null, created_at: '2026-01-01T09:00:00Z', ...o });
const item = (k: string) => HR_CHECKLIST.find((i) => i.key === k)!;

test('what goes in whose folder', () => {
  const keys = (t: string | null, role: string) => itemsFor({ user_id: 'u', org_id: 'o', employment_type: t }, role).map((i) => i.key);
  assert.ok(keys('employee', 'operative').includes('contract') && keys('employee', 'operative').includes('havs'));
  assert.ok(!keys('cis', 'operative').includes('contract') && keys('cis', 'operative').includes('cis_verify'));
  assert.ok(keys(null, 'driver').includes('dvla') && !keys(null, 'pm').includes('dvla'));
  assert.ok(keys(null, 'pm').includes('rtw') && !keys(null, 'pm').includes('havs'));
});

test('missing, on file, expiring, expired, due again', () => {
  const today = '2026-11-14';
  assert.equal(itemState(item('rtw'), [], today).state, 'missing');
  assert.equal(itemState(item('rtw'), [doc({ item_key: 'rtw', expiry_date: '2027-06-01' })], today).state, 'ok');
  assert.equal(itemState(item('rtw'), [doc({ item_key: 'rtw', expiry_date: '2026-12-01' })], today).state, 'expiring');
  assert.equal(itemState(item('rtw'), [doc({ item_key: 'rtw', expiry_date: '2026-11-01' })], today).state, 'expired');
  // Recorded on the record itself, no file.
  assert.equal(itemState(item('rtw'), [], today, { user_id: 'u', org_id: 'o', rtw_checked_on: '2026-01-02', rtw_expiry: null }).state, 'ok');
  assert.equal(itemState(item('dvla'), [doc({ item_key: 'dvla', doc_date: '2025-10-01' })], today).state, 'due');
  assert.equal(itemState(item('payslip'), [doc({ item_key: 'payslip', doc_date: '2026-10-31' })], today).state, 'ok');
  assert.equal(expiringDocs([doc({ expiry_date: '2026-11-20' }), doc({ expiry_date: '2027-11-20' }), doc({ expiry_date: '2026-10-20' })], today).map((x) => x.expired).join(), 'false,true');
});

test('when the next appraisal is due', () => {
  const a = (o: Partial<Appraisal>): Appraisal => ({ id: 'a', user_id: 'u', manager_id: null, due_date: '2026-01-01', status: 'done', self_answers: null, review: null, rating: null, summary: null, completed_at: null, created_at: '', ...o });
  const rec = { user_id: 'u', org_id: 'o', start_date: '2026-03-02', probation_end: '2026-09-02' };
  assert.deepEqual(nextAppraisal(rec, [], 12, '2026-11-14'), { due: '2026-09-02', open: null, overdue: true });
  assert.equal(nextAppraisal(rec, [a({ completed_at: '2026-09-10T10:00:00Z' })], 6, '2026-11-14')!.due, '2027-03-10');
  const open = a({ status: 'self_done', due_date: '2026-12-01' });
  assert.equal(nextAppraisal(rec, [open], 12, '2026-11-14')!.open, open);
  assert.equal(nextAppraisal({ user_id: 'u', org_id: 'o' }, [], 12), null);
  // Month ends stay in the right month (review, 15 Nov 2026).
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2027-08-31', 6), '2028-02-29');
  assert.equal(addMonths('2026-01-15', 12), '2027-01-15');
});
