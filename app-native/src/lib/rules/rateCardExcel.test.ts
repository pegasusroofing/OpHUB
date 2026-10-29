/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rateCardSheets, readRateCard } from './rateCardExcel.ts';
import { makeXlsx } from './xlsx.ts';
import { readXlsx } from './xlsxRead.ts';

test('rate card goes out to Excel and comes back the same', async () => {
  const items = [
    { id: 'a', category: 'Pitched Roofing', name: 'Strip and re-slate', unit: 'm2', is_dropdown: false, rate: 12.5 },
    { id: 'v', category: 'Roofline', name: 'Valleys', unit: 'lm', is_dropdown: true, rate: null },
  ];
  const options = [{ id: 'o1', rate_item_id: 'v', label: 'Lead', rate: 40 }, { id: 'o2', rate_item_id: 'v', label: 'GRP', rate: 32.5 }];
  const sheets = await readXlsx(makeXlsx(rateCardSheets(items, options, 'RTB')));
  assert.deepEqual(sheets.map((s) => s.name), ['Read Me', 'Pitched Roofing', 'Roofline']);
  const back = readRateCard(sheets);
  assert.equal(back.skipped, 0);
  assert.deepEqual(back.items.map((i) => [i.category, i.name, i.unit, i.rate, i.is_dropdown, i.options.map((o) => [o.label, o.rate])]), [
    ['Pitched Roofing', 'Strip and re-slate', 'm2', 12.5, false, []],
    ['Roofline', 'Valleys', 'lm', null, true, [['Lead', 40], ['GRP', 32.5]]],
  ]);
});
