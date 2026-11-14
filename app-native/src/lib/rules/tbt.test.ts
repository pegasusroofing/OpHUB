/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tbtEvery, tbtEveryLabel, tbtNeed, tbtPeriod } from './tbt.ts';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('not set is every month, as before; unknown values too', () => {
  assert.equal(tbtEvery(null), 'month');
  assert.equal(tbtEvery('nonsense'), 'month');
  assert.equal(tbtEvery('3months'), '3months');
  assert.equal(tbtEveryLabel(undefined), 'Every Month');
});

test('periods: weeks from Monday due Friday, fortnights from 5 Jan 2026, months due the 7th', () => {
  const sat = new Date(2026, 10, 14, 18); // Saturday 14 Nov 2026
  const w = tbtPeriod('week', sat)!;
  assert.equal(ymd(w.start), '2026-11-09'); assert.equal(ymd(w.due), '2026-11-13');
  const f = tbtPeriod('2weeks', sat)!; // 5 Jan + 44 weeks = 9 Nov starts a fortnight
  assert.equal(ymd(f.start), '2026-11-09');
  assert.equal(ymd(tbtPeriod('2weeks', new Date(2026, 10, 17))!.start), '2026-11-09');
  assert.equal(ymd(tbtPeriod('2weeks', new Date(2026, 10, 23))!.start), '2026-11-23');
  const m = tbtPeriod('month', sat)!;
  assert.equal(ymd(m.start), '2026-11-01'); assert.equal(ymd(m.due), '2026-11-07'); assert.equal(m.word, 'this month');
  assert.equal(ymd(tbtPeriod('2months', sat)!.start), '2026-11-01');
  assert.equal(ymd(tbtPeriod('3months', sat)!.start), '2026-10-01');
  assert.equal(tbtPeriod('3months', sat)!.word, 'this quarter');
  assert.equal(ymd(tbtPeriod('6months', sat)!.start), '2026-07-01');
  assert.equal(tbtPeriod('off', sat), null);
});

test('what a site needs', () => {
  const done = { status: 'completed', created_at: '2026-10-03T09:00:00' };
  const now = new Date(2026, 10, 14, 12);
  assert.equal(tbtNeed([done], 'month', now)!.kind, 'overdue'); // nothing issued in November, past the 7th
  assert.equal(tbtNeed([done], 'month', new Date(2026, 10, 5))!.kind, 'due');
  assert.equal(tbtNeed([done], '3months', now), null); // October's talk covers the quarter
  assert.equal(tbtNeed([done, { status: 'live', created_at: '2026-11-02T09:00:00' }], 'month', now), null);
  assert.equal(tbtNeed([{ status: 'live', created_at: '2026-11-02T09:00:00' }], 'month', now)!.kind, 'never');
  assert.equal(tbtNeed([], 'off', now), null);
});
