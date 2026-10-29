/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoAllocate, canIssue, pbRound2, rowsToSave, workingFromRows, type PbWorking } from './priceSheet.ts';
import type { RateItem } from './rateCard.ts';

const items: Record<string, RateItem> = {
  a: { id: 'a', category: 'Pitched Roofing', name: 'Strip and re-slate', unit: 'm2', is_dropdown: false, rate: 12.5 },
  v: { id: 'v', category: 'Roofline', name: 'Valleys', unit: 'lm', is_dropdown: true, rate: null },
};

test('price sheet: draft keeps ticks, issue drops empty lines, manual rate, custom rows, totals', () => {
  const w: PbWorking = { title: 'Main roof', assignedUserIds: [], populateSOW: true, customRows: [{ localId: 'c', id: null, name: 'Skip', rate: 150, quantity: 1, unit: 'item' }, { localId: 'd', id: null, name: 'Half', rate: '', quantity: 2, unit: 'item' }], items: {
    a: { rateItemId: 'a', quantity: 10.333, optionId: null, optionRate: null, optionLabel: null, nameOverride: null, rateOverride: null, isManualRate: false },
    'v::o1': { rateItemId: 'v', quantity: 4, optionId: 'o1', optionRate: 20, optionLabel: 'Lead', nameOverride: null, rateOverride: 22, isManualRate: true },
    'v::o2': { rateItemId: 'v', quantity: '', optionId: 'o2', optionRate: 18, optionLabel: 'GRP', nameOverride: null, rateOverride: null, isManualRate: false },
  } };
  const draft = rowsToSave(w, items, { a: 'row-a' }, false);
  assert.equal(draft.rows.length, 5); assert.equal(draft.rows[0].id, 'row-a');
  const issue = rowsToSave(w, items, {}, true);
  assert.deepEqual(issue.rows.map((r) => r.name), ['Strip and re-slate', 'Valleys', 'Skip']);
  assert.equal(issue.rows[1].rate, 22); assert.equal(issue.total, pbRound2(10.333 * 12.5 + 88 + 150));
  assert.equal(canIssue(w), true);
  const back = workingFromRows([{ id: 'r1', sheet_id: 's', rate_item_id: 'v', category: 'Roofline', name: 'Valleys', unit: 'lm', rate: 22, quantity: 4, option_id: 'o1', option_label: 'Lead', is_manual_rate: true, line_total: 88, sort_order: 0 }], items, () => 20, { title: 'T', assigned_user_ids: null, schedule_section_id: 'x' });
  assert.equal(back.items['v::o1'].rateOverride, 22); assert.equal(back.items['v::o1'].optionRate, 20); assert.equal(back.populateSOW, false);
});

test('wages share out top-down, skipping manual rows and full items', () => {
  const r = autoAllocate([{ id: '1', rate: 10, quantity: 5 }, { id: '2', rate: 20, quantity: 10 }, { id: '3', rate: 5, quantity: 100 }], { 1: 3 }, { 3: 40 }, 200);
  assert.deepEqual(r.rows, [{ id: '1', qty: 2, amount: 20, manual: false }, { id: '2', qty: 9, amount: 180, manual: false }]);
  assert.equal(r.left, 0);
});
