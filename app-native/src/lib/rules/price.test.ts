/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { elementFigures, groupFigures, money, readAmount, type PriceElement } from './price.ts';

const el = (p: Partial<PriceElement> = {}) => ({ id: 'e', site_id: 's', sub_site_id: null, name: 'Flat', sort_order: 0, price_total: 10000, price_booked_override: null, closed: false, closed_show_price_to_operatives: false, group_id: 'g', ...p }) as PriceElement;

test('balance = price + approved variations − booked in', () => {
  const f = elementFigures(el(), [{ element_id: 'e', week_number: 1, amount: 2500 }, { element_id: 'x', week_number: 1, amount: 99 }], [{ element_id: 'e', amount: 500, status: 'approved' }, { element_id: 'e', amount: 300, status: 'pending' }]);
  assert.equal(f.bookedIn, 2500);
  assert.equal(f.awNotApprovedTotal, 300);
  assert.equal(f.balance, 8000);
  assert.equal(elementFigures(el({ price_booked_override: 4000 }), [{ element_id: 'e', week_number: 1, amount: 2500 }], []).bookedIn, 4000);
});

test('group figures add open tiles only; money and amounts', () => {
  const a = el({ id: 'a' }), b = el({ id: 'b', closed: true });
  const figs = { a: elementFigures(a, [], []), b: elementFigures(b, [], []) };
  assert.deepEqual(groupFigures([a, b], figs).g, { priceTotal: 10000, bookedIn: 0, awApprovedTotal: 0, count: 1, balance: 10000 });
  assert.equal(money(1234.5), '£1,234.50');
  assert.equal(readAmount('£1,200'), 1200);
  assert.equal(readAmount('abc'), 'bad');
  assert.equal(readAmount(' '), null);
});
