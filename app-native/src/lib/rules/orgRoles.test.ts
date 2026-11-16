/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupByRole, holders, roleChoices, roleName, roleOf, withDefaults, type OrgRole } from './orgRoles.ts';

const roles: OrgRole[] = withDefaults([]);
const id = (n: string) => roles.find((r) => r.name === n)?.id as string;

test('the starting list is Andy’s, then the app’s other levels', () => {
  assert.deepEqual(roles.slice(0, 7).map((r) => r.name), ['Admin', 'Contracts Administrator', 'Finance Controller', 'Project Manager', 'Quantity Surveyor', 'Document Controller', 'Contracts Manager']);
  assert.ok(roles.some((r) => r.name === 'Operative' && r.access === 'operative'));
  // one default per level
  const defs = roles.filter((r) => r.is_default).map((r) => r.access);
  assert.equal(new Set(defs).size, defs.length);
});

test('a person’s role: the one chosen if it matches their level, else the default', () => {
  assert.equal(roleName({ id: 'a', role: 'pm' }, roles), 'Project Manager');
  assert.equal(roleName({ id: 'a', role: 'pm', org_role_id: id('Quantity Surveyor') }, roles), 'Quantity Surveyor');
  assert.equal(roleName({ id: 'a', role: 'pm', is_estimator: true }, roles), 'Estimator');
  assert.equal(roleName({ id: 'a', role: 'pm', is_estimator: true, finance_only: true }, roles), 'Finance Controller');
  // chosen role no longer matches (made an operative in the current app): the default for the new level
  assert.equal(roleOf({ id: 'a', role: 'operative', org_role_id: id('Quantity Surveyor') }, roles)?.name, 'Operative');
  // a level with no role left in the list
  assert.equal(roleName({ id: 'a', role: 'client' }, roles.filter((r) => r.access !== 'client')), 'Client (View Only)');
});

test('grouped under the list, in order, empty roles left out', () => {
  const people = [{ id: '1', role: 'operative' }, { id: '2', role: 'pm', org_role_id: id('Contracts Manager') }, { id: '3', role: 'admin' }, { id: '4', role: 'pm' }];
  assert.deepEqual(groupByRole(people, roles).map((g) => [g.title, g.people.map((p) => p.id)]), [['Admin', ['3']], ['Project Manager', ['4']], ['Contracts Manager', ['2']], ['Operative', ['1']]]);
  assert.equal(holders(roles.find((r) => r.name === 'Project Manager') as OrgRole, people, roles).length, 1);
});

test('who can be moved to what', () => {
  // an admin: any role of the allowed levels
  assert.ok(roleChoices(['pm', 'operative'], roles, true).some((r) => r.name === 'Quantity Surveyor'));
  // a PM: only each level's default (the database chooses the role for them)
  assert.deepEqual(roleChoices(['operative', 'site_manager', 'driver'], roles, false).map((r) => r.name), ['Site Manager', 'Operative', 'Delivery Driver']);
  // not their own level: that would say "Role changed" and change nothing (bug review, 16 Nov 2026)
  assert.deepEqual(roleChoices(['pm', 'estimator'], roles, false, 'pm').map((r) => r.name), ['Estimator']);
});
