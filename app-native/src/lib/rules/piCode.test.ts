/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codePatch, codeStart } from './piCode.ts';

const CATS = { materials: 'Materials', plant: 'Plant', subcontract: 'Subcontract' };

test('purchase invoice line coding: one project keeps it simple, several split the net', () => {
  const inv = { site_id: 'A', cost_code: 'materials', net: 300, lines: [{ description: 'Slates', amount: 200 }, { description: 'Skip hire', qty: 1, unit_price: 100 }, { kind: 'total', amount: 300 }] };
  const lines = codeStart(inv, CATS);
  assert.deepEqual(lines.map((l) => [l.amount, l.site_id, l.cost_code]), [[200, 'A', 'materials'], [100, 'A', 'materials']]);
  const one = codePatch(inv, [lines[0], { ...lines[1], cost_code: 'plant' }]);
  assert.ok('patch' in one && one.patch.split.length === 2 && one.patch.split[0].amount === 200 && one.patch.split[1].cost_code === 'plant');
  const same = codePatch(inv, lines);
  assert.ok('patch' in same && same.patch.split === null && same.patch.lines[1].cost_code === 'materials');
  const two = codePatch(inv, [lines[0], { ...lines[1], site_id: 'B' }]);
  assert.ok('patch' in two && two.patch.split.map((x: { site_id: string; pct: number }) => [x.site_id, x.pct]).join() === 'A,66.6667,B,33.3333');
  assert.deepEqual(codePatch({ ...inv, lines: [] }, []), { error: 'These lines have no amounts to share by.' });
});
