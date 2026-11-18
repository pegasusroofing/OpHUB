/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_PARTS, BASE_PARTS, can, partsOf, splitParts, startingParts, withPart } from './rolePerms.ts';

test('admins can do everything, whatever their list says', () => {
  assert.equal(can({ role: 'admin', perms: [] }, 'fin_edit'), true);
  assert.equal(can({ role: 'superadmin', perms: [] }, 'people'), true);
  assert.equal(can({ role: 'admin', perms: [], perms_extra: [] }, 'home_money'), true);
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

test('the two extra parts: their own list; not set yet, what the old setting gave', () => {
  assert.equal(can({ role: 'pm', perms: null }, 'home_money'), false);
  assert.equal(can({ role: 'pm', perms: null }, 'home_money', true), true);
  assert.equal(can({ role: 'pm', perms: null, perms_extra: [] }, 'home_money', true), false);
  assert.equal(can({ role: 'pm', perms: [], perms_extra: ['mat_costs'] }, 'mat_costs'), true);
  assert.equal(ALL_PARTS.length, 17);
  assert.equal(BASE_PARTS.length, 15);
});

test('adding and taking out keep the board’s order, once each', () => {
  assert.deepEqual(withPart(['reports', 'every_job'], 'prices', true), ['every_job', 'prices', 'reports']);
  assert.deepEqual(withPart(['every_job', 'prices'], 'prices', true), ['every_job', 'prices']);
  assert.deepEqual(withPart(ALL_PARTS, 'fin_edit', false), ALL_PARTS.filter((k) => k !== 'fin_edit'));
  assert.deepEqual(withPart(['fin_view'], 'home_money', true), ['fin_view', 'home_money']);
  assert.deepEqual(partsOf(['nonsense', 'notify', 'sow']), ['sow', 'notify']);
});

test('a role’s parts and how they are saved', () => {
  assert.deepEqual(partsOf(null, null, ['home_money']), ALL_PARTS.filter((k) => k !== 'mat_costs'));
  assert.deepEqual(partsOf(['sow'], ['mat_costs'], ['home_money']), ['mat_costs', 'sow']);
  assert.deepEqual(splitParts(['every_job', 'mat_costs', 'home_money', 'sow']), { perms: ['every_job', 'sow'], extra: ['home_money', 'mat_costs'] });
});

test('a new role starts as the company’s Project Manager', () => {
  assert.deepEqual(startingParts([{ access: 'pm', is_default: true, perms: ['sow', 'every_job'], perms_extra: ['home_money'] }, { access: 'pm', is_default: false, perms: [] }]), { perms: ['every_job', 'sow'], extra: ['home_money'] });
  assert.deepEqual(startingParts([{ access: 'pm', is_default: true, perms: null }]), { perms: null, extra: null });
});
