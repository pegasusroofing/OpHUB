/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { weeklyBookedIn, weeklyWages } from './priceWeeks.ts';

test('weekly booked in: in week order with a running total', () => {
  assert.deepEqual(weeklyBookedIn([{ week_number: 2, amount: 250.5 }, { week_number: 1, amount: 1000 }, { week_number: 3, amount: null }]),
    [['Week 1', 1000, 1000], ['Week 2', 250.5, 1250.5], ['Week 3', 0, 1250.5]]);
  assert.deepEqual(weeklyBookedIn([]), []);
});

test('labour wages: every entry for the week added up', () => {
  assert.deepEqual(weeklyWages([{ week_number: 3, amount: 120 }, { week_number: 1, amount: 100.1 }, { week_number: 3, amount: 80.2 }, { week_number: 1, amount: 0.2 }]),
    [['Week 1', 100.3], ['Week 3', 200.2]]);
});
