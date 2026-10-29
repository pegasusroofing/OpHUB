/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  alreadyMessage, buildCheckinSessions, checkedInElsewhere, checkinDayLabel, distMeters, fullSiteAddress,
  geofenceError, greeting, latestByAddress, needsGps, siteStatusKey, statusFromLatest,
} from './checkin.ts';

test('distMeters: 0 for the same point, ~111km per degree of latitude', () => {
  assert.equal(distMeters(51.5, -0.1, 51.5, -0.1), 0);
  assert.ok(Math.abs(distMeters(51, 0, 52, 0) - 111195) < 50);
});

test('geofenceError: no fence = no check', () => {
  assert.equal(geofenceError('in', { lat: 0, lon: 0 }, { geofence_lat: null, geofence_lon: null, geofence_radius_m: 100 }, 'site'), null);
});

test('geofenceError: inside passes, outside gives the old wording, default radius 100m', () => {
  const fence = { geofence_lat: 51.5, geofence_lon: -0.1, geofence_radius_m: null };
  assert.equal(geofenceError('in', { lat: 51.5005, lon: -0.1 }, fence, 'site'), null); // ~56m
  const msg = geofenceError('out', { lat: 51.502, lon: -0.1 }, fence, 'site'); // ~222m
  assert.match(msg ?? '', /^22\dm from site — must be within 100m to check out\. Move closer and try again\.$/);
  assert.match(geofenceError('in', { lat: 51.502, lon: -0.1 }, { ...fence, geofence_radius_m: 50 }, 'this address') ?? '', /from this address — must be within 50m to check in/);
});

test('statusFromLatest', () => {
  assert.equal(statusFromLatest([]), 'out');
  assert.equal(statusFromLatest([{ type: 'in' }, { type: 'out' }]), 'in');
  assert.equal(statusFromLatest([{ type: 'out' }, { type: 'in' }]), 'out');
});

test('alreadyMessage stops double check-in and check-out with no check-in', () => {
  assert.equal(alreadyMessage('in', true), "You're already checked in.");
  assert.equal(alreadyMessage('out', false), "You're not checked in.");
  assert.equal(alreadyMessage('in', false), null);
  assert.equal(alreadyMessage('out', true), null);
  assert.equal(alreadyMessage('in', true, true), "You're already checked in here.");
});

test('multi-site: latest per address and "checked in elsewhere"', () => {
  const rows = [
    { sub_site_id: 'a', type: 'in', user_id: 'u', ts: '3' },
    { sub_site_id: 'b', type: 'out', user_id: 'u', ts: '2' },
    { sub_site_id: 'a', type: 'out', user_id: 'u', ts: '1' },
    { sub_site_id: null, type: 'in', user_id: 'u', ts: '0' },
  ];
  const latest = latestByAddress(rows);
  assert.equal(latest.a.ts, '3');
  assert.equal(latest.b.type, 'out');
  assert.deepEqual(checkedInElsewhere(latest, 'b').sort(), ['', 'a']);
  assert.deepEqual(checkedInElsewhere(latest, 'a'), ['']);
});

test('needsGps: managers never, operatives yes', () => {
  assert.equal(needsGps(true), false);
  assert.equal(needsGps(false), true);
  assert.equal(needsGps(false, false), false);
});

test('buildCheckinSessions pairs in/out and keeps strays', () => {
  const r = (user_id: string, type: string, ts: string) => ({ user_id, type, ts });
  const s = buildCheckinSessions([r('a', 'out', '1'), r('a', 'in', '2'), r('a', 'in', '3'), r('a', 'out', '4'), r('b', 'in', '5')]);
  assert.deepEqual(s.map((x) => [x.user_id, x.in?.ts ?? null, x.out?.ts ?? null]), [
    ['a', null, '1'], ['a', '2', null], ['a', '3', '4'], ['b', '5', null],
  ]);
});

test('checkinDayLabel', () => {
  const now = new Date(2026, 9, 28, 15, 0);
  assert.equal(checkinDayLabel(new Date(2026, 9, 28, 7, 30), now), 'Today');
  assert.equal(checkinDayLabel(new Date(2026, 9, 27, 23, 59), now), 'Yesterday');
  assert.match(checkinDayLabel(new Date(2026, 9, 20), now), /20 Oct 2026/);
});

test('siteStatusKey treats live/active the same, unknown as upcoming', () => {
  assert.equal(siteStatusKey({ status: 'active' }), 'live');
  assert.equal(siteStatusKey({ status: 'live' }), 'live');
  assert.equal(siteStatusKey({ status: 'closed' }), 'closed');
  assert.equal(siteStatusKey({ status: null }), 'upcoming');
  assert.equal(siteStatusKey({ status: 'weird' }), 'upcoming');
});

test('fullSiteAddress', () => {
  assert.equal(fullSiteAddress({ address: ' 1 High St ', postcode: 'AB1 2CD' }), '1 High St, AB1 2CD');
  assert.equal(fullSiteAddress({ address: '', postcode: null }), null);
});

test('greeting', () => {
  assert.equal(greeting(new Date(2026, 0, 1, 9)), 'Good morning');
  assert.equal(greeting(new Date(2026, 0, 1, 13)), 'Good afternoon');
  assert.equal(greeting(new Date(2026, 0, 1, 19)), 'Good evening');
});

test('saved clients: one per name, latest contact details win, A–Z', async () => {
  const { clientPortfolio } = await import('./checkin.ts');
  const p = clientPortfolio([
    { client_name: 'Bellway Homes', client_contact_name: 'Sam', client_email: 'old@b.test', created_at: '2026-01-01' },
    { client_name: 'Acme', created_at: '2026-02-01' },
    { client_name: 'bellway homes ', client_email: 'new@b.test', created_at: '2026-03-01' },
    { client_name: '', created_at: '2026-04-01' },
  ]);
  assert.deepEqual(p.map((c) => [c.name, c.contact, c.email, c.count]), [['Acme', '', '', 1], ['bellway homes', 'Sam', 'new@b.test', 2]]);
});
