/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { brandOf, cleanMaker, codeText, coshhItem, duplicates, parseCodes, routesFor, suggestPictos, suggestSignal } from './coshh.ts';

test('typed codes become official wording', () => {
  assert.deepEqual(parseCodes('h 315, H319 + h317 H315', 'H'), ['H315', 'H319', 'H317']);
  assert.deepEqual(parseCodes('P280 p305 + P351+P338', 'P'), ['P280', 'P305+P351+P338']);
  assert.equal(codeText('H315'), 'Causes skin irritation.');
  assert.ok(codeText('P305+P351+P338').startsWith('IF IN EYES'));
  assert.equal(codeText('H999'), '');
});

test('symbols, signal word and routes from the H codes', () => {
  assert.deepEqual(suggestPictos(['H225', 'H315']), ['GHS02', 'GHS07']);
  assert.deepEqual(suggestPictos(['H301', 'H315']), ['GHS06']);
  assert.equal(suggestSignal(['H315']), 'Warning');
  assert.equal(suggestSignal(['H314']), 'Danger');
  assert.deepEqual(routesFor(['H315', 'H332'], []), ['inhale', 'skin']);
});

test('manufacturers group and duplicates are found', () => {
  const lib = [coshhItem({ id: 'a', title: 'Primer', data: { manufacturer: 'Bauder Ltd' }, created_at: '2026-01-01' }), coshhItem({ id: 'b', title: 'primer ', data: { manufacturer: 'Paul Bauder GmbH & Co KG' }, created_at: '2026-02-01' })];
  const of = brandOf(lib);
  assert.equal(of(lib[0]), 'Bauder'); assert.equal(of(lib[1]), 'Bauder');
  assert.deepEqual(duplicates(lib).map((x) => x.id), ['b']);
  assert.equal(cleanMaker('Company designation Bauder Ltd.'), 'Bauder Ltd');
});
