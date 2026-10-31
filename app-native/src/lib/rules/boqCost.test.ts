/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costFromPct, groupRange, insertAt, marginText } from './boqCost.ts';

test('BoQ cost from a margin or mark-up, and the margin text', () => {
  assert.equal(costFromPct(1000, 'margin', 25), 750);
  assert.equal(costFromPct(1000, 'markup', 25), 800);
  assert.equal(costFromPct(null, 'margin', 25), null);
  assert.equal(marginText(1000, 750), 'Margin 25% (£250.00) · mark-up 33.3%');
  assert.equal(marginText(1000, null), '');
});

test('BoQ group ranges and where new lines go', () => {
  const rows = [{ kind: 'section' }, { kind: 'item' }, { kind: 'subsection' }, { kind: 'item' }, { kind: 'item' }, { kind: 'section' }, { kind: 'item' }];
  assert.deepEqual(groupRange(rows, 0), [1, 3, 4]);
  assert.deepEqual(groupRange(rows, 2), [3, 4]);
  assert.equal(insertAt(rows, 0, 'item'), 2); // under the section heading, before its sub-section
  assert.equal(insertAt(rows, 2, 'item'), 5); // end of the sub-section
  assert.equal(insertAt(rows, 0, 'subsection'), 5); // end of the section
  assert.equal(insertAt(rows, 3, 'item'), 4); // straight after an item
});
