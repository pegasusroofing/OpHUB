/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markCanvas, markRadius, nearestOp, nextFree, refreshKeyColours, type MarkOp, hitMark, hitStroke, scaleMark, shiftMark } from './markup.ts';

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

test('hitMark picks the number or text under a point, never a pen line', () => {
  const ops = [{ t: 'pen', c: '#000', w: 4, pts: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }, { t: 'num', n: 1, c: '#f00', r: 20, x: 100, y: 100 }, { t: 'text', c: '#000', fs: 20, s: 'Leak', x: 300, y: 300 }] as never[];
  assert.equal(hitMark(ops, { x: 105, y: 110 }, 10), 1);
  assert.equal(hitMark(ops, { x: 330, y: 302 }, 10), 2);
  assert.equal(hitMark(ops, { x: 12, y: 12 }, 10), -1);
});
test('scaleMark grows and shrinks within limits', () => {
  assert.equal((scaleMark({ t: 'num', n: 1, c: '#f00', r: 20, x: 0, y: 0 }, 1.2, 1000) as { r: number }).r, 24);
  assert.equal((scaleMark({ t: 'num', n: 1, c: '#f00', r: 7, x: 0, y: 0 }, 0.5, 1000) as { r: number }).r, 6);
  assert.equal((scaleMark({ t: 'text', c: '#f00', fs: 20, s: 'a', x: 0, y: 0 }, 1.5, 1000) as { fs: number }).fs, 30);
});

test('hitStroke picks the pen line or arrow under a point; shiftMark moves any mark', () => {
  const ops = [
    { t: 'pen', c: '#f00', w: 4, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    { t: 'arrow', c: '#f00', w: 4, pts: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
    { t: 'num', c: '#f00', n: 1, x: 10, y: 10, r: 8 },
  ] as MarkOp[];
  assert.equal(hitStroke(ops, { x: 50, y: 3 }, 10), 0);
  assert.equal(hitStroke(ops, { x: 50, y: 47 }, 10), 1);
  assert.equal(hitStroke(ops, { x: 50, y: 25 }, 10), -1);
  assert.deepEqual((shiftMark(ops[1], 5, 5) as { pts: { x: number; y: number }[] }).pts[0], { x: 5, y: 55 });
  assert.deepEqual([(shiftMark(ops[2], 2, 3) as { x: number }).x, (shiftMark(ops[2], 2, 3) as { y: number }).y], [12, 13]);
});
