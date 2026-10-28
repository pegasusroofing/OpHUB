/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { combineStart, defaultDetails, hazardFromLib, lines, missingInfo, moveItem, moveLib, ramsSettings, renameInTemplate, riskBand, rr, type LibItem } from './rams.ts';

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

test('starting a RAMS combines templates and copies once each', () => {
  const lib: LibItem[] = [
    { id: 'h1', kind: 'hazard', title: 'Noise', sort_order: 0, data: { harm: 'Hearing', controls: ['ear defenders'] } },
    { id: 's1', kind: 'section', title: 'PPE', sort_order: 0, data: { part: 'general' } },
    { id: 't1', kind: 'template', title: 'Roof', sort_order: 0, data: { hazards: ['noise', 'Missing'], sections: ['PPE'], ppe: ['harness'], groups: ['Tenants'] } },
  ];
  const d = defaultDetails({ name: 'Job' }, 'Addr', 'Andy', ramsSettings({ nextRa: 42, nextMs: 7 }, 'RTB'), new Date(2026, 0, 5));
  assert.equal(d.raNumber, '0000000042'); assert.equal(d.reviewDate, '2027-01-05');
  const out = combineStart(lib, ['t1'], [{ hazards: [{ id: 'a', title: 'NOISE', harm: '', p: 1, s: 1, rp: 1, rs: 1, controls: [] }, { id: 'b', title: 'Dust', harm: '', p: 1, s: 1, rp: 1, rs: 1, controls: [] }], sections: [{ id: 'm', part: 'method', title: 'Strip', body: '', steps: [] }] }], d);
  assert.deepEqual(out.hazards.map((h) => h.title), ['Noise', 'Dust']);
  assert.deepEqual(out.sections.map((s) => s.title), ['PPE', 'Strip']);
  assert.deepEqual(out.missing, ['Missing']);
  assert.ok(out.ppe.includes('harness')); assert.deepEqual(out.details.groups, ['Tenants']);
  assert.deepEqual(missingInfo(d), ['Client contact', 'Description of works', 'Start date']);
  const arr = [{ id: 'a', part: 'general' }, { id: 'b', part: 'method' }, { id: 'c', part: 'general' }];
  assert.deepEqual(moveItem(arr, 'a', 1)?.map((x) => x.id), ['c', 'b', 'a']);
  assert.equal(moveItem(arr, 'b', 1), null);
});
