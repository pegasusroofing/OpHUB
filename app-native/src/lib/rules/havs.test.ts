/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayStatus, points, thresholdMessage, titleCaseWords, weekDates, wholeMinutes } from './havs.ts';

test('points match the HSE calculator', () => {
  // 2.5 m/s² for a full 8 hours = exactly the EAV (100 points); 5 m/s² = ELV (400).
  assert.equal(Math.round(points(2.5, 480)), 100);
  assert.equal(Math.round(points(5, 480)), 400);
  // 10 m/s² for 30 minutes: A(8) = 2.5 → 100 points.
  assert.equal(Math.round(points(10, 30)), 100);
});

test('wholeMinutes', () => {
  assert.deepEqual(wholeMinutes(''), { ok: false, empty: true });
  assert.deepEqual(wholeMinutes('12.5'), { ok: false, error: 'Whole numbers only.' });
  assert.deepEqual(wholeMinutes('0'), { ok: false, error: 'Enter minutes between 1 and 480.' });
  assert.deepEqual(wholeMinutes('481'), { ok: false, error: 'Enter minutes between 1 and 480.' });
  assert.deepEqual(wholeMinutes(' 45 '), { ok: true, minutes: 45 });
});

test('weekDates gives Monday to Friday', () => {
  const d = weekDates(0, new Date(2026, 9, 28)); // Wed
  assert.deepEqual(d.map((x) => x.getDate()), [26, 27, 28, 29, 30]);
  assert.equal(weekDates(-1, new Date(2026, 9, 28))[0].getDate(), 19);
});

test('dayStatus', () => {
  assert.equal(dayStatus(0), null);
  assert.equal(dayStatus(99), 'ok');
  assert.equal(dayStatus(100), 'eav');
  assert.equal(dayStatus(400), 'elv');
});

test('thresholdMessage only when an entry crosses a limit', () => {
  assert.equal(thresholdMessage(50, 90, '', 'Bob', '27 Oct'), null);
  assert.equal(thresholdMessage(120, 150, '', 'Bob', '27 Oct'), null);
  assert.equal(thresholdMessage(90, 110, 'Job: ', 'Bob', '27 Oct')?.kind, 'havs_eav_exceeded');
  const m = thresholdMessage(90, 410, 'Job: ', 'Bob', '27 Oct');
  assert.equal(m?.kind, 'havs_elv_exceeded');
  assert.equal(m?.body, 'Job: Bob has exceeded the daily HAVS Exposure Limit Value (ELV) on 27 Oct — 410 pts. Immediate action required.');
});

test('titleCaseWords keeps acronyms', () => {
  assert.equal(titleCaseWords('SDS drill'), 'SDS Drill');
});
