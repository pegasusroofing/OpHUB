/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markCanvas, markRadius, nearestOp, nextFree, refreshKeyColours, type MarkOp } from './markup.ts';

test('mark-up: canvas size, radius, numbering after keys, eraser reach, key colours follow the condition', () => {
  assert.deepEqual(markCanvas(7200, 3600), { W: 3600, H: 1800 });
  assert.deepEqual(markCanvas(1000, 800), { W: 1000, H: 800 });
  assert.equal(markRadius(3600, 1800, 'm'), 38);
  assert.equal(markRadius(400, 300, 'xs'), 9);
  const ops: MarkOp[] = [
    { t: 'num', n: 2, c: '#D32F2F', r: 30, x: 100, y: 100, key: true, auto: true },
    { t: 'num', n: 5, c: '#111111', r: 30, x: 400, y: 100 },
    { t: 'pen', c: '#111111', w: 8, pts: [{ x: 600, y: 600 }, { x: 700, y: 700 }] },
  ];
  assert.equal(nextFree(ops, [{ n: 7, label: 'Gutter', color: null }]), 8);
  assert.equal(nearestOp(ops, { x: 110, y: 95 }, 30), 0);
  assert.equal(nearestOp(ops, { x: 705, y: 700 }, 30), 2);
  assert.equal(nearestOp(ops, { x: 250, y: 400 }, 30), -1);
  assert.equal(refreshKeyColours(ops, [{ n: 2, label: 'Ridge', color: '#1F9D52' }, { n: 5, label: 'x', color: '#2F6FD9' }]), true);
  assert.equal((ops[0] as { c: string }).c, '#1F9D52');
  assert.equal((ops[1] as { c: string }).c, '#111111');
});
