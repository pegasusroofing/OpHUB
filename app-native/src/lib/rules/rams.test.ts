/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hazardFromLib, lines, moveLib, ramsSettings, renameInTemplate, riskBand, rr, type LibItem } from './rams.ts';

test('risk bands follow the RTB colours', () => {
  assert.equal(riskBand(rr(4, 5)).label, 'Urgent');
  assert.equal(riskBand(12).label, 'High');
  assert.equal(riskBand(8).label, 'Medium');
  assert.equal(riskBand(3).label, 'Low');
  assert.equal(riskBand(1).label, 'Very low');
});

test('library copies, settings, renames and moves', () => {
  const h = hazardFromLib({ id: 'L', kind: 'hazard', title: 'Noise', sort_order: 0, data: { harm: 'Hearing', p: 4, s: 1, rp: 1, rs: 1, controls: ['a'] } });
  assert.equal(h.libId, 'L'); assert.deepEqual(h.controls, ['a']);
  assert.equal(ramsSettings(null, 'RTB').nextRa, 1);
  assert.ok(ramsSettings(null, 'RTB').dataProtection.includes('RTB'));
  assert.deepEqual(lines(' a \n\n b'), ['a', 'b']);
  assert.deepEqual(renameInTemplate({ hazards: ['Noise', 'Dust'] }, 'hazards', 'Noise', 'Noise (site)'), { hazards: ['Noise (site)', 'Dust'] });
  assert.equal(renameInTemplate({ hazards: ['Dust'] }, 'hazards', 'Noise', 'x'), null);
  const s = (id: string, part: string) => ({ id, kind: 'section', title: id, sort_order: 0, data: { part } }) as LibItem;
  assert.equal(moveLib([s('a', 'general'), s('b', 'method')], 'a', 1), null);
  assert.deepEqual(moveLib([s('a', 'general'), s('b', 'general')], 'a', 1)?.map((x) => x.id), ['b', 'a']);
});
