/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rateCategories, readRate, type RateItem } from './rateCard.ts';

test('rate card groups in RTB order with options attached', () => {
  const it = (id: string, category: string): RateItem => ({ id, category, name: id, unit: 'lm', is_dropdown: id === 'd', rate: 1 });
  const { cats, opts } = rateCategories([it('a', 'Zinc'), it('b', 'General'), it('c', 'Pitched Roofing'), it('d', 'General')], [{ id: 'o', rate_item_id: 'd', label: 'Tile', rate: 2 }]);
  assert.deepEqual(cats.map((c) => c.name), ['Pitched Roofing', 'General', 'Zinc']);
  assert.equal(cats[1].items.length, 2);
  assert.equal(opts.d[0].label, 'Tile');
  assert.equal(readRate('£1,250.50'), 1250.5);
  assert.equal(readRate('abc'), null);
});
