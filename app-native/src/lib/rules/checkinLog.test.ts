/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byDay, logRange, pairSessions } from './checkinLog.ts';

test('pairSessions: lone ins stay open, lone outs have no in', () => {
  const r = (ts: string, type: string) => ({ ts, type, site_id: 's', user_id: 'u' });
  const s = pairSessions([r('2026-11-02T08:00:00Z', 'in'), r('2026-11-02T16:00:00Z', 'out'), r('2026-11-03T07:00:00Z', 'out'), r('2026-11-04T08:00:00Z', 'in')]);
  assert.deepEqual(s.map((x) => [!!x.inTs, !!x.outTs]), [[true, true], [false, true], [true, false]]);
  assert.equal(byDay(s).hours, '8.0');
});

test('logRange: weeks start Monday; custom dates include the last day', () => {
  const w = logRange('weekly', 0, undefined, undefined, +new Date('2026-10-28T12:00:00'));
  assert.equal(new Date(w.start).getDay(), 1);
  assert.equal(w.end - w.start, 7 * 864e5);
  const c = logRange('weekly', 0, '2026-10-01', '2026-10-01');
  assert.equal(c.end - c.start, 864e5);
});
