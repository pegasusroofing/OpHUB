import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoDue, quoteReport, type RQuote } from './quoteReports.ts';
import { chaseStatus, isQuoted, outcomeOf, statusWord } from './quotes.ts';

const q = (o: Partial<RQuote>): RQuote => ({ client_name: 'A', title: 't', discipline: null, value: null, status: 'pricing', return_date: null, priced_by_name: null, completed_at: null, chase_on: false, next_chase_date: null, ...o });

test('a returned quote is Quoted and leaves Live (Andy, 11 Nov 2026)', () => {
  assert.equal(isQuoted(q({ status: 'returned', returned_at: '2026-11-01' })), true);
  assert.equal(isQuoted(q({ status: 'checking' })), false);
  assert.equal(isQuoted(q({ status: 'won' })), true);
  // Put back to a work status after sending: still quoted, it went out.
  assert.equal(isQuoted(q({ status: 'awaiting', returned_at: '2026-11-01' })), true);
});
test('outcomes: no word back is No News, declined is Lost', () => {
  assert.deepEqual(['returned', 'no_reply', 'negotiating', 'won', 'lost', 'declined'].map(outcomeOf), ['no_news', 'no_news', 'negotiating', 'won', 'lost', 'lost']);
  assert.equal(statusWord(q({ status: 'checking' })), 'Ready For Checking');
  assert.equal(statusWord(q({ status: 'returned', returned_at: '2026-11-01' })), 'No News');
});
test('chase status', () => {
  assert.equal(chaseStatus({ status: 'returned', chase_on: false, next_chase_date: null, chase_count: 0 }, '2026-11-11'), 'Off');
  assert.equal(chaseStatus({ status: 'returned', chase_on: true, next_chase_date: '2026-11-10', chase_count: 1 }, '2026-11-11'), 'Due · Chased ×1');
  assert.equal(chaseStatus({ status: 'returned', chase_on: true, next_chase_date: '2026-12-10', chase_count: 0 }, '2026-11-11'), 'On');
});
test('Live and Quoted reports split the quotes, and Quoted totals the value', () => {
  const all = [q({ title: 'a' }), q({ title: 'b', status: 'returned', returned_at: '2026-11-01', value: 100 }), q({ title: 'c', status: 'won', value: 50 })];
  assert.deepEqual(quoteReport('live', all, '2026-11-11').rows.map((r) => r[1]), ['a']);
  const qd = quoteReport('quoted', all, '2026-11-11');
  assert.deepEqual(qd.rows.map((r) => r[1]), ['b', 'c']);
  assert.equal(qd.totals?.[3], 150);
  assert.equal(quoteReport('tracker', all, '2026-11-11').rows.length, 3);
});
test('auto exports go once a period, on the right day', () => {
  // 11 Nov 2026 is a Wednesday.
  assert.deepEqual(autoDue({ id: '1', report: 'live', every: 'weekly', day: 3, format: 'xlsx' }, '2026-11-11', undefined), { due: true, period: '2026-11-11-w' });
  assert.equal(autoDue({ id: '1', report: 'live', every: 'weekly', day: 3, format: 'xlsx' }, '2026-11-11', '2026-11-11-w').due, false);
  assert.equal(autoDue({ id: '1', report: 'live', every: 'weekly', day: 1, format: 'xlsx' }, '2026-11-11', undefined).due, false);
  assert.equal(autoDue({ id: '1', report: 'live', every: 'daily', format: 'xlsx' }, '2026-11-14', undefined).due, false); // Saturday
  assert.equal(autoDue({ id: '1', report: 'live', every: 'monthly', day: 11, format: 'xlsx' }, '2026-11-11', '2026-10').due, true);
});
