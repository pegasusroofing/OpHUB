/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientContacts, contactLabel, contactSub } from './contacts.ts';

const dir = [{ name: 'Bellway Homes', email: 'accounts@bellway.example', phone: '0191 000 0000', estimator_name: 'Sam Price', estimator_email: 'sam@bellway.example', estimator_phone: '07700 111111' }, { name: 'Persimmon', email: 'ap@persimmon.example' }];
const sites = [
  { client_name: 'Bellway Homes', client_contact_name: 'Jo Site', client_phone: '07700 222222', client_email: 'jo@bellway.example', created_at: '2026-10-01' },
  { client_name: 'bellway homes', client_contact_name: 'Jo Site', client_phone: '07700 333333', client_email: '', created_at: '2026-11-01' },
  { client_name: 'Persimmon', client_contact_name: 'Pat', client_phone: '', client_email: '', created_at: '2026-09-01' },
];
const quotes = [{ client_name: 'Bellway Homes', contact_name: 'sam price', contact_phone: '', contact_email: 'sam@bellway.example' }, { client_name: 'Bellway Homes', contact_name: 'Kim Buyer', contact_phone: '07700 444444', contact_email: '' }];

test("every contact known for the client, each person once, newest project's number first", () => {
  const c = clientContacts('Bellway Homes', dir, sites, quotes);
  assert.deepEqual(c.map((x) => [x.name, x.phone]), [['Sam Price', '07700 111111'], ['', '0191 000 0000'], ['Jo Site', '07700 333333'], ['Kim Buyer', '07700 444444']]);
  assert.equal(c[2].email, 'jo@bellway.example'); // filled from the older project
  assert.equal(contactLabel(c[1]), 'Main Contact');
  assert.equal(contactSub(c[0]), '07700 111111 · sam@bellway.example');
});

test('another client, or none', () => {
  assert.deepEqual(clientContacts('Persimmon', dir, sites, quotes).map(contactLabel), ['Main Contact', 'Pat']);
  assert.equal(contactLabel({ name: '', phone: '1', email: '', from: 'Past Project' }), 'Contact From A Past Project');
  assert.deepEqual(clientContacts('Nobody Ltd', dir, sites, quotes), []);
  assert.deepEqual(clientContacts('  ', dir, sites, quotes), []);
});
