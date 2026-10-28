/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCoordToken, radiusOptions, splitCoordPair, validLatLon } from './geo.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;

test('decimal and hemisphere letters', () => {
  assert.equal(parseCoordToken('51.51828'), 51.51828);
  assert.equal(parseCoordToken('-0.15139'), -0.15139);
  assert.equal(parseCoordToken('0.15139 W'), -0.15139);
  assert.equal(parseCoordToken('S 33.9'), -33.9);
  assert.ok(Number.isNaN(parseCoordToken('hello')));
});

test("Google's degrees/minutes/seconds", () => {
  assert.ok(near(parseCoordToken(`51°31'05.8"N`), 51.518278));
  assert.ok(near(parseCoordToken(`0°09'05.0"W`), -0.151389));
  assert.ok(near(parseCoordToken('51° 31′ 05.8″ N'), 51.518278));
});

test('a whole pair pasted into one box', () => {
  assert.deepEqual(splitCoordPair('51.51828, -0.15139'), ['51.51828', '-0.15139']);
  assert.deepEqual(splitCoordPair(`51°31'05.8"N 0°09'05.0"W`), [`51°31'05.8"N`, `0°09'05.0"W`]);
  assert.equal(splitCoordPair('51.5'), null);
});

test('validLatLon and radius options', () => {
  assert.equal(validLatLon(51.5, -0.1), true);
  assert.equal(validLatLon(95, 0), false);
  assert.deepEqual(radiusOptions(120), [25, 50, 75, 100, 120, 150, 200, 300, 500]);
  assert.equal(radiusOptions(null).length, 8);
});
