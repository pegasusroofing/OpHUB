/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rolePatch, roleActionsFor, roleChangePatch, shownRole } from './users.ts';

const admin = { id: 'a', role: 'admin' }, pm = { id: 'p', role: 'pm' }, op = { id: 'o', role: 'operative' }, sm = { id: 's', role: 'site_manager' };

test('nobody changes themselves; only admins touch admins', () => {
  assert.deepEqual(roleActionsFor(admin, admin, [admin]), { options: null, canRemove: false });
  assert.deepEqual(roleActionsFor(pm, { id: 'a2', role: 'admin' }, [admin]), { options: null, canRemove: false });
  // the last admin can't be demoted
  assert.deepEqual(roleActionsFor(admin, { id: 'a2', role: 'admin' }, [{ id: 'a2', role: 'admin' }]).options?.map((x) => x.value), ['admin']);
});

test('PMs manage operatives; only admins remove PMs and site managers', () => {
  assert.equal(roleActionsFor(pm, op, []).canRemove, true);
  assert.equal(roleActionsFor(pm, sm, []).canRemove, false);
  assert.equal(roleActionsFor(admin, sm, []).canRemove, true);
  assert.ok(!roleActionsFor(pm, op, [])?.options?.some((x) => x.value === 'admin'));
  assert.ok(roleActionsFor(admin, op, [])?.options?.some((x) => x.value === 'admin'));
  assert.deepEqual(roleActionsFor(sm, op, []).options?.map((x) => x.value), ['operative']);
});

test('a company admin can set anyone to any role, but not themselves or the last admin', () => {
  const every = ['admin', 'pm', 'estimator', 'site_manager', 'operative', 'driver', 'client'];
  for (const role of ['client', 'driver', 'operative', 'site_manager', 'pm']) assert.deepEqual(roleActionsFor(admin, { id: 'x', role }, [admin]).options?.map((x) => x.value), every);
  assert.deepEqual(roleActionsFor(admin, { id: 'a2', role: 'admin' }, [admin, { id: 'a2', role: 'admin' }]).options?.map((x) => x.value), every);
  assert.equal(roleActionsFor(pm, { id: 'c', role: 'client' }, [admin]).options, null);
});

test('moving someone off admin / PM takes their Finance access away', () => {
  assert.deepEqual(roleChangePatch('client'), { role: 'client', is_estimator: false, finance_enabled: false, see_costs: false });
  assert.deepEqual(roleChangePatch('pm'), { role: 'pm', is_estimator: false });
});

test('estimator is a PM flag', () => {
  assert.deepEqual(rolePatch('estimator'), { role: 'pm', is_estimator: true });
  assert.equal(shownRole({ id: 'x', role: 'pm', is_estimator: true }), 'estimator');
});
