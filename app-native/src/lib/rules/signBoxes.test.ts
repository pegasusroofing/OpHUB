/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { align, repeatBoxes, repeatOffset, summary, whoColor, whoLabel, type SBox } from './signBoxes.ts';

test('box labels, colours and summary', () => {
  assert.equal(whoLabel('op3'), 'Operative 3'); assert.equal(whoLabel('client'), 'Client 1'); assert.equal(whoLabel('pm', true), 'PM');
  assert.equal(whoColor('pm'), '#6B3F86');
  const b = (w: string, t = 'sig'): SBox => ({ p: 1, w, t, r: [0.1, 0.1, 0.2, 0.05] });
  assert.equal(summary([b('op1'), b('op2'), b('pm'), b('client2')]), '4 boxes · 2 operatives, project manager, 2 clients');
});

test('copying a row down to the next operative', () => {
  const mine: SBox[] = [{ p: 1, w: 'op1', t: 'name', r: [0.1, 0.5, 0.3, 0.04] }, { p: 1, w: 'op1', t: 'sig', r: [0.45, 0.5, 0.3, 0.04] }];
  const off = repeatOffset(mine, 0.6, 0.57);
  assert.deepEqual(off, { dx: 0, dy: 0.05 });
  assert.equal(repeatOffset(mine, 0.25, 0.52), null);
  const r = repeatBoxes(mine, 'op1', 1, off!);
  assert.equal(r?.next, 'op2'); assert.equal(r?.boxes.length, 4); assert.equal(r?.boxes[2].r[1], 0.55);
  assert.equal(repeatBoxes(mine, 'op1', 1, { dx: 0, dy: 0.6 }), null);
});

test('aligning to the first box', () => {
  const bx: SBox[] = [{ p: 1, w: 'op1', t: 'sig', r: [0.1, 0.1, 0.2, 0.05] }, { p: 1, w: 'op2', t: 'sig', r: [0.3, 0.3, 0.1, 0.02] }];
  assert.equal(align(bx, [0, 1], 'v')[1].r[0], 0.1);
  assert.equal(align(bx, [0, 1], 'h')[1].r[1], 0.1);
  assert.deepEqual(align(bx, [0, 1], 'size')[1].r.slice(2), [0.2, 0.05]);
  assert.equal(bx[1].r[0], 0.3); // original untouched
});
