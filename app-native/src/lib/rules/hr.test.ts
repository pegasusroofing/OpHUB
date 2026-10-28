/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bankHolsForYear, bookingParts, isBankHol, isWorkingDay, leaveDays, limitClash, usedDays, type Leave } from './hr.ts';

test('bank holidays: published years and worked-out years agree', () => {
  assert.deepEqual(bankHolsForYear(2027), ['2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28']);
  assert.ok(isBankHol('2030-12-25'));
  assert.equal(isWorkingDay('2026-12-25'), false);
  assert.equal(isWorkingDay('2026-10-31'), false); // Saturday
});

test('leaveDays: skips weekends, counts part days', () => {
  // Thu afternoon + Fri = 1.5
  assert.equal(leaveDays({ start_date: '2026-11-05', end_date: '2026-11-06', half: null, start_part: 'pm', end_part: null }), 1.5);
  // Fri to Mon = 2 working days
  assert.equal(leaveDays({ start_date: '2026-11-06', end_date: '2026-11-09', half: null, start_part: null, end_part: null }), 2);
  assert.equal(leaveDays({ start_date: '2026-11-06', end_date: '2026-11-06', half: 'am', start_part: null, end_part: null }), 0.5);
});

test('usedDays and limitClash', () => {
  const l = (id: string, uid: string, s: string, e: string, status = 'approved', extra: Partial<Leave> = {}) => ({ id, user_id: uid, type: 'annual', start_date: s, end_date: e, half: null, start_part: null, end_part: null, days: 0, status, note: null, ...extra }) as Leave;
  const leave = [l('1', 'a', '2026-11-09', '2026-11-10'), l('2', 'b', '2026-11-10', '2026-11-10', 'pending'), l('3', 'a', '2026-12-25', '2026-12-25', 'approved', { bank_holiday: true })];
  assert.equal(usedDays(leave, 'a', 2026, ['approved']), 3);
  assert.deepEqual(limitClash(leave, 'c', '2026-11-09', '2026-11-11', 2), { day: '2026-11-10', n: 2 });
  assert.equal(limitClash(leave, 'c', '2026-11-09', '2026-11-11', 2, true), null);
  assert.deepEqual(bookingParts('2026-11-05', '2026-11-05', 'pm', 'full', 'full'), { half: 'pm', start_part: null, end_part: null });
});
