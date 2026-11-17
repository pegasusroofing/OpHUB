/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_PARTS, can, partsOf, startingParts, withPart } from './rolePerms.ts';

test('admins can do everything, whatever their list says', () => {
  assert.equal(can({ role: 'admin', perms: [] }, 'fin_edit'), true);
  assert.equal(can({ role: 'superadmin', perms: [] }, 'people'), true);
});

test('no list kept: everything, as before the board', () => {
  assert.equal(can({ role: 'pm' }, 'hs_signoff'), true);
  assert.equal(can({ role: 'pm', perms: null }, 'fin_edit'), true);
  assert.equal(can(null, 'reports'), false);
});

test('a kept list: only its parts', () => {
  const est = { role: 'pm', perms: ['every_job', 'prices', 'quotes'] };
  assert.equal(can(est, 'quotes'), true);
  assert.equal(can(est, 'hs_signoff'), false);
  assert.equal(can({ role: 'pm', perms: [] }, 'reports'), false);
});

test('adding and taking out keep the board’s order, once each', () => {
  assert.deepEqual(withPart(['reports', 'every_job'], 'prices', true), ['every_job', 'prices', 'reports']);
  assert.deepEqual(withPart(['every_job', 'prices'], 'prices', true), ['every_job', 'prices']);
  assert.deepEqual(withPart(null, 'fin_edit', false), ALL_PARTS.filter((k) => k !== 'fin_edit'));
  assert.deepEqual(partsOf(['nonsense', 'notify', 'sow']), ['sow', 'notify']);
});

test('a new role starts as the company’s Project Manager', () => {
  assert.deepEqual(startingParts([{ access: 'pm', is_default: true, perms: ['sow', 'every_job'] }, { access: 'pm', is_default: false, perms: [] }]), ['every_job', 'sow']);
  assert.equal(startingParts([{ access: 'pm', is_default: true, perms: null }]), null);
});
