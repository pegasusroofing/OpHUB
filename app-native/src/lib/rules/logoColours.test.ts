/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mainColours, tapToPixel, toHex } from './logoColours.ts';

test('logo colours: a pixel as a colour code', () => {
  assert.equal(toHex(78, 143, 209), '#4E8FD1');
  assert.equal(toHex(0, 0, 0), '#000000');
});

test('logo colours: the main colours, most used first, with the white background and see-through pixels left out', () => {
  const px: number[] = [];
  const add = (r: number, g: number, b: number, a: number, times: number) => { for (let i = 0; i < times; i++) px.push(r, g, b, a); };
  add(255, 255, 255, 255, 500); // white background
  add(0, 0, 0, 0, 300); // see-through
  add(227, 38, 43, 255, 200); // red
  add(16, 17, 20, 255, 120); // near-black
  add(229, 40, 45, 255, 50); // the same red, a shade off
  assert.deepEqual(mainColours(px), ['#E3262B', '#101114']);
});

test('logo colours: a tap lands on the picture shown "contain", or on the margin', () => {
  // A 200 x 100 logo in a 240 x 240 box: shown 240 x 120, with 60 above and below.
  assert.deepEqual(tapToPixel(120, 120, 240, 240, 200, 100), { x: 100, y: 50 });
  assert.equal(tapToPixel(120, 20, 240, 240, 200, 100), null);
});
