/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildIcs } from './ics.ts';

test('ics: all-day events, exclusive end, escaped text', () => {
  const s = buildIcs([{ id: 'e1', title: 'Scaffold up; roof, start', event_date: '2026-12-31' }], 'Studley Rd', new Date(Date.UTC(2026, 9, 29, 8, 5, 0)));
  assert.match(s, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(s, /SUMMARY:Scaffold up\\; roof\\, start/); assert.match(s, /DTSTAMP:20261029T080500Z/); assert.ok(s.startsWith('BEGIN:VCALENDAR') && s.endsWith('END:VCALENDAR'));
});
