/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cancelReasonText, comingToSite, doneEntries, groupPickups, liveEntries, matAgo, onSentPo, readIsoDate, subAddrLabel, type Mat } from './materials.ts';

const m = (o: Partial<Mat>): Mat => ({ id: 'x', site_id: 's', item: 'Slates', qty: '1', status: 'pending', requested_by: null, created_at: '2026-10-01T09:00:00Z', required_by_date: null, ...o });
const iso = (d: Date) => d.toISOString().slice(0, 10);

test('matAgo', () => {
  const now = new Date('2026-10-28T12:00:00Z').getTime();
  assert.equal(matAgo('2026-10-28T08:00:00Z', now), 'today');
  assert.equal(matAgo('2026-10-27T08:00:00Z', now), 'yesterday');
  assert.equal(matAgo('2026-10-20T08:00:00Z', now), '8d ago');
  assert.equal(matAgo('2026-09-28T08:00:00Z', now), '4w ago');
});

test('cancel reasons hide PO numbers from operatives', () => {
  assert.equal(cancelReasonText('Cancelled on PO RTB1-PO-002 in Finance', false), 'the order was cancelled by the office');
  assert.equal(cancelReasonText('Cancelled on PO RTB1-PO-002 in Finance', true), 'Cancelled on PO RTB1-PO-002 in Finance');
  assert.equal(cancelReasonText('Not needed', false), 'Not needed');
});

test('doneEntries groups by send time and supplier', () => {
  const r = doneEntries([m({ id: 'a', sent_at: 't1', merchant: 'Jewson' }), m({ id: 'b', sent_at: 't1', merchant: 'Jewson' }), m({ id: 'c' }), m({ id: 'd', sent_at: 't1', merchant: 'SIG' })]);
  assert.deepEqual(r.map((e) => e.items.map((x) => x.id)), [['a', 'b'], ['c'], ['d']]);
});

test('liveEntries groups by group_id', () => {
  const r = liveEntries([m({ id: 'a', group_id: 'g' }), m({ id: 'b' }), m({ id: 'c', group_id: 'g' })]);
  assert.deepEqual(r.map((e) => e.items.map((x) => x.id)), [['a', 'c'], ['b']]);
});

test('comingToSite', () => {
  const r = comingToSite([
    m({ id: 'a', status: 'sent', required_for_delivery: '2026-10-30' }),
    m({ id: 'b', status: 'closed', merchant: 'J', fulfilment: 'collection' }),
    m({ id: 'c', status: 'closed', merchant: 'J', grn: { ok: true, at: '2026-10-28T10:00:00Z' } }),
    m({ id: 'd', status: 'closed', merchant: 'J', grn: { ok: true, at: '2026-10-20T10:00:00Z' } }),
    m({ id: 'e', status: 'closed', merchant: 'J', required_for_delivery: '2026-09-01' }),
    m({ id: 'f', status: 'closed' }),
  ], '2026-10-28', '2026-10-14', iso);
  assert.deepEqual(r.map((x) => x.id), ['a', 'c']);
});

test('onSentPo', () => {
  assert.equal(onSentPo(m({ po_number: 'P1', status: 'closed' })), true);
  assert.equal(onSentPo(m({ po_number: 'P1', status: 'pending' })), false);
  assert.equal(onSentPo(m({ po_number: 'P1', status: 'cancelled', sent_at: 't' })), false);
  assert.equal(onSentPo(m({ status: 'closed' })), false);
});

test('readIsoDate and subAddrLabel', () => {
  assert.equal(readIsoDate(''), null);
  assert.equal(readIsoDate('2026-11-03'), '2026-11-03');
  assert.equal(readIsoDate('2026-02-30'), 'bad');
  assert.equal(readIsoDate('3/11/26'), 'bad');
  assert.equal(subAddrLabel({ name: 'Block A', address: '12 High St', postcode: 'AB1 2CD' }), 'Block A — 12 High St, AB1 2CD');
  assert.equal(subAddrLabel({ name: 'Block B' }), 'Block B');
});

test('groupPickups', () => {
  const g = groupPickups([
    { id: '1', item: 'a', qty: null, status: 'assigned', supplier_id: 's1' },
    { id: '2', item: 'b', qty: null, status: 'assigned', supplier_id: null },
    { id: '3', item: 'c', qty: null, status: 'assigned', supplier_id: 's1' },
  ], (id) => (id === 's1' ? 'Jewson' : null));
  assert.deepEqual(g.map((x) => [x.name, x.items.length]), [['Jewson', 2], ['To collect', 1]]);
});

import { orderCcEmails, orderNote, orderRecipient, parseCc, sendToOptions, sortSuppliers, companyOperativeLabel } from './materials.ts';

test('order recipient and CCs', () => {
  const s = { id: 's', name: 'Jewson', email: 'orders@jewson.co.uk' };
  const b = { id: 'b', name: 'Leeds', email: 'leeds@jewson.co.uk' };
  assert.equal(orderRecipient(s, { sendTo: 'branch', branch: b }, false, 'me@x.com'), 'leeds@jewson.co.uk');
  assert.equal(orderRecipient(s, { sendTo: 'branch', branch: null }, false, 'me@x.com'), 'orders@jewson.co.uk');
  assert.equal(orderRecipient(s, { sendTo: 'pm', branch: b }, false, 'me@x.com'), 'me@x.com');
  assert.deepEqual(orderCcEmails(s, { sendTo: 'branch', branch: b, ccEmails: ['a@b.com'] }, false), ['a@b.com', 'orders@jewson.co.uk']);
  assert.deepEqual(orderCcEmails(s, { sendTo: 'main', branch: b, ccEmails: [] }, false), []);
  assert.deepEqual(sendToOptions(s, b, 'me@x.com').map((o) => o.key), ['branch', 'main', 'pm']);
});

test('order note, cc parsing, labels, supplier sort', () => {
  assert.equal(orderNote('rear gate', { id: 'b', name: 'Leeds', address: '1 Road', phone: '0113' }, 'delivery', ['Block A']), 'Deliver to: Block A — Branch: Leeds — 1 Road (0113) — rear gate');
  assert.equal(orderNote('x', null, 'collection', ['Block A']), 'x');
  assert.deepEqual(parseCc('a@b.com, bad; c@d.co.uk'), { ok: ['a@b.com', 'c@d.co.uk'], bad: ['bad'] });
  assert.equal(companyOperativeLabel('RTB Roofing Ltd'), 'RTB Operative');
  assert.deepEqual(sortSuppliers([{ name: 'B' }, { name: 'A' }, { name: 'C', favourite: true }], '').map((s) => s.name), ['C', 'A', 'B']);
});
