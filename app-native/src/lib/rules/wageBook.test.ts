import assert from 'node:assert/strict';
import { test } from 'node:test';

import { opInvoicePushes, payeWeekPushes, pickWeek, priceEntry, pushChanges, weekChoices } from './wageBook.ts';

test('an operative invoice makes one push per job, adding lines on the same job', () => {
  const r = opInvoicePushes({ id: 'i1', name: 'Bob', invoice_no: '7', period_start: '2026-10-26', lines: [{ site_id: 'a', amount: 100, description: 'Strip' }, { site_id: 'a', amount: 50.5 }, { site_id: 'b', amount: 20 }] }, 'u1', 'o', 'me');
  assert.equal(r.length, 2);
  assert.equal(r[0].amount, 150.5); assert.equal(r[0].src_key, 'pay|i1|a'); assert.equal(r[0].description, 'Invoice 7 · Strip'); assert.equal(r[0].operative_id, 'u1');
});
test('someone with no login has no operative id', () => {
  assert.equal(opInvoicePushes({ id: 'i', lines: [{ site_id: 'a', amount: 1 }] }, 'w:9', 'o', 'me')[0].operative_id, null);
});
test('PAYE wages: one day per person per job per day, only inside the week, only PAYE', () => {
  const ck = (u: string, s: string, ts: string) => ({ user_id: u, site_id: s, ts, type: 'in' });
  const r = payeWeekPushes([ck('p', 'a', '2026-10-26T08:00:00Z'), ck('p', 'a', '2026-10-26T13:00:00Z'), ck('p', 'a', '2026-10-27T08:00:00Z'), ck('p', 'b', '2026-10-28T08:00:00Z'), ck('p', 'a', '2026-11-02T08:00:00Z'), ck('c', 'a', '2026-10-26T08:00:00Z'), ck('n', 'a', '2026-10-26T08:00:00Z')],
    [{ user_id: 'p', pay_type: 'paye', day_rate: 150 }, { user_id: 'c', pay_type: 'cis', day_rate: 200 }, { user_id: 'n', pay_type: 'paye', day_rate: null }], { p: 'Pat', n: 'Nia' }, '2026-10-26', 'o', 'me');
  assert.deepEqual(r.rows.map((x) => [x.site_id, x.days, x.amount]), [['a', 2, 300], ['b', 1, 150]]);
  assert.deepEqual(r.noRate, ['Nia']);
});
test('changes: new, altered, taken off', () => {
  const row = (k: string, amount: number) => ({ src_key: k, amount, days: 0 }) as never;
  const c = pushChanges([{ src_key: 'same', amount: 5, days: 0, status: 'price' }, { src_key: 'alt', amount: 5, days: 0, status: 'price' }, { src_key: 'back', amount: 5, days: 0, status: 'withdrawn' }, { src_key: 'gone', amount: 5, days: 0, status: 'pending' }], [row('same', 5), row('alt', 6), row('back', 5), row('new', 1)]);
  assert.deepEqual(c.add.map((x) => (x as { src_key: string }).src_key), ['new']);
  assert.deepEqual(c.change.map((x) => (x.row as { src_key: string }).src_key), ['alt', 'back']);
  assert.deepEqual(c.gone.map((x) => x.src_key), ['gone']);
});
test('week of the price follows the job start, else the latest', () => {
  assert.equal(pickWeek(2, '2026-10-05', '2026-10-26'), 4);
  assert.equal(pickWeek(2, null, '2026-10-26'), 2);
  assert.equal(pickWeek(0, null, null), 1);
  assert.equal(pickWeek(3, '2026-11-02', '2026-10-26'), 3);
  const w = weekChoices(2, '2026-10-05', '2026-10-26');
  assert.deepEqual(w.map((x) => x.week), [4, 3, 2, 1]);
  assert.equal(w.find((x) => x.picked)?.week, 4);
  assert.match(w[2].label, /Week 2 · w\/c 12 Oct \(latest\)/);
});
test('price line: named operative or labelled cost', () => {
  assert.equal(priceEntry({ site_id: 's', amount: 9, operative_id: 'u' }, 'e', 1, 'me').kind, 'extra_operative');
  const c = priceEntry({ site_id: 's', amount: 9, operative_id: null, person_name: 'Temp' }, 'e', 1, 'me');
  assert.equal(c.kind, 'cost'); assert.equal((c as { label?: string }).label, 'Temp');
});
