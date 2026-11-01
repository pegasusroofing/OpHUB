import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupQuotes, readTenderLog, statusPatch, type QuoteRow } from './quotes.ts';

const q = (o: Partial<QuoteRow>): QuoteRow => ({ client_name: 'A', title: 't', discipline: null, value: null, status: 'pricing', return_date: null, priced_by_name: null, completed_at: null, chase_on: true, next_chase_date: null, ...o });

test('returning a quote sets the first chase, like the sheet: return date + 30', () => {
  const p = statusPatch('returned', { chase_on: true, return_date: '2026-11-01' }, '2026-11-01', 30);
  assert.equal(p.next_chase_date, '2026-12-01');
  assert.equal(p.returned_at, '2026-11-01');
});
test('a return date still ahead counts from that date', () => {
  assert.equal(statusPatch('returned', { chase_on: true, return_date: '2026-11-10' }, '2026-11-01', 30).next_chase_date, '2026-12-10');
});
test('tender stage and closing turn the chaser off', () => {
  for (const s of ['negotiating', 'won', 'lost', 'no_reply', 'declined']) {
    const p = statusPatch(s, { chase_on: true, return_date: null }, '2026-11-01', 30);
    assert.equal(p.chase_on, false); assert.equal(p.next_chase_date, null);
  }
  assert.equal(statusPatch('won', { chase_on: true, return_date: null }, '2026-11-01', 30).completed_at, '2026-11-01');
  assert.equal(statusPatch('checking', { chase_on: true, return_date: null }, '2026-11-01', 30).completed_at, null);
});
test('figures by customer: win rate ignores live quotes', () => {
  const g = groupQuotes([q({ status: 'won', value: 100 }), q({ status: 'lost', value: 50 }), q({ status: 'returned', value: 10 })], 'client_name')[0];
  assert.deepEqual([g.count, g.value, g.won, g.lost, g.wonValue, g.rate], [3, 160, 1, 1, 100, 50]);
});
test('no closed quotes means no win rate, not 0%', () => { assert.equal(groupQuotes([q({})], 'client_name')[0].rate, null); });
test('blank groups are named, and years come from completed or return date', () => {
  assert.equal(groupQuotes([q({})], 'discipline')[0].key, 'Not set');
  assert.equal(groupQuotes([q({ return_date: '2025-03-01' })], 'year')[0].key, '2025');
});
const head = ['Client', 'Address', 'Discipline', 'Tender Value £', 'Profit %', 'Return Date', 'Returned?', 'Client Secured?', 'Chase Date', 'Chased?', 'Outcome', 'Feedback / Status'];
test('reads the tender log, and tidies disciplines and outcomes', () => {
  const r = readTenderLog([['RTB title'], head, ['GPF', 'Pickford', 'flat', 1000, 0.3, '2026-10-30', 'true', 'No', '', 'Yes', 'Secured', 'price'], ['Mulalley', 'Balfour', 'Repairs', '', '', '2026-11-06', 'false', 'No', '', '', '', 'Andy C']], ['Andy C']);
  assert.ok('rows' in r);
  assert.deepEqual([r.rows[0].discipline, r.rows[0].status, r.rows[0].value, r.rows[0].notes, r.rows[0].completed_at, r.rows[0].chase_count], ['Flat Roofing', 'won', 1000, 'price', '2026-10-30', 1]);
  assert.deepEqual([r.rows[1].status, r.rows[1].priced_by_name, r.rows[1].notes, r.rows[1].value], ['pricing', 'Andy C', null, null]);
});
test('section headings and half rows are skipped, and a bad date is dropped', () => {
  const r = readTenderLog([head, ['Returned Tenders', 'x'], ['Only a client', ''], ['', ''], ['C', 'Job', '', '', '', '1904-02-13', '', '', '', '', '', '']], []);
  assert.ok('rows' in r);
  assert.equal(r.skipped, 2); assert.equal(r.rows.length, 1); assert.equal(r.rows[0].return_date, null);
});
test('a different sheet is refused', () => { assert.ok('error' in readTenderLog([['a', 'b']], [])); });
