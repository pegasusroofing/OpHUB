import assert from 'node:assert/strict';
import { test } from 'node:test';

import { areaHome, parentOf } from '../navBack.ts';

test('back with no history goes one level up', () => {
  const id = '4defa781-f15f-485d-9a3a-6e908598e0de';
  assert.equal(parentOf('/fin'), '/home');
  assert.equal(parentOf('/fin/jobs'), '/fin');
  assert.equal(parentOf('/fin/purchases?tab=invoices'), '/fin');
  assert.equal(parentOf(`/fin/job/${id}`), '/fin/jobs');
  assert.equal(parentOf(`/fin/job/${id}/costs`), `/fin/job/${id}`);
  assert.equal(parentOf('/fin/labour/new'), '/fin/subs');
  assert.equal(parentOf('/fin/pinv/x'), '/fin/purchases?tab=invoices');
  assert.equal(parentOf('/pm/dashboard'), '/home');
  assert.equal(parentOf('/pm/admin/users'), '/pm/admin');
  assert.equal(parentOf('/pm/operatives/x'), '/pm/operatives');
  assert.equal(parentOf('/sites'), '/home');
  assert.equal(parentOf('/sites/new'), '/sites');
  assert.equal(parentOf(`/sites/${id}`), '/sites');
  assert.equal(parentOf(`/sites/${id}/materials`), `/sites/${id}`);
  assert.equal(parentOf('/account'), '/home');
  assert.equal(parentOf('/fin/yardin'), '/fin/yard');
  assert.equal(parentOf('/pm/delivery/x'), '/pm/deliveries');
});

test('the bold line goes to the first page of each part of the app', () => {
  const id = '4defa781-f15f-485d-9a3a-6e908598e0de';
  assert.equal(areaHome(`/sites/${id}/materials/requests`), '/sites');
  assert.equal(areaHome(`/sites/${id}`), '/sites');
  assert.equal(areaHome(`/fin/job/${id}/boq`), '/fin');
  assert.equal(areaHome('/pm/quotes/settings'), '/pm/quotes');
  assert.equal(areaHome('/pm/hr/holidays'), '/pm/hr');
  assert.equal(areaHome(`/pm/delivery/${id}`), '/pm/deliveries');
  assert.equal(areaHome('/account'), '/home');
});
