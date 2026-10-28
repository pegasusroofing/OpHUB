/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addFollowUp, cleanAnswerSets, cleanForSave, dependents, moveItem, removeItem, removeSection, setType, typeKey, type Item, type Section } from './templates.ts';

const q = (id: string, p: Partial<Item> = {}) => ({ id, type: 'passfail', label: id, ...p }) as Item;

test('follow-ups sit after the question and its existing follow-ups, and cannot move above it', () => {
  const items = [q('a'), q('b', { showIf: { qId: 'a', mode: 'equals', values: ['Fail'] } }), q('c')];
  const r = addFollowUp(items, 0, 'Pass');
  assert.deepEqual(r.items.map((x) => x.id).slice(0, 2), ['a', 'b']);
  assert.equal(r.items[2].showIf?.qId, 'a');
  assert.equal(moveItem(items, 1, -1), 'blocked');
  assert.deepEqual((moveItem(items, 2, -1) as Item[]).map((x) => x.id), ['a', 'c', 'b']);
});

test('removing a question can take its follow-ups too, or free them', () => {
  const items = [q('a'), q('b', { showIf: { qId: 'a' } }), q('c', { showIf: { qId: 'b' } }), q('d')];
  assert.deepEqual([...dependents(items, 'a')].sort(), ['b', 'c']);
  assert.deepEqual(removeItem(items, 'a', true).map((x) => x.id), ['d']);
  const kept = removeItem(items, 'a', false);
  assert.equal(kept.find((x) => x.id === 'b')?.showIf, undefined);
  assert.equal(kept.find((x) => x.id === 'c')?.showIf?.qId, 'b');
});

test('types, answer sets, sections and save tidy-up', () => {
  const sets = [{ id: 's1', name: 'Condition', options: ['Good', 'Poor'] }];
  const it = setType(q('x'), 'set:s1', sets);
  assert.deepEqual([it.type, it.options, typeKey(it, sets)], ['choice', ['Good', 'Poor'], 'set:s1']);
  assert.equal(typeKey(setType(q('y'), 'ynnv', sets), sets), 'ynnv');
  assert.equal(cleanAnswerSets([{ id: 'z', name: '', options: [' A ', ''] }])?.[0].name, 'A');
  assert.equal(cleanAnswerSets([{ id: 'z', name: 'Empty', options: [''] }]), null);
  const secs = [{ id: '1', title: 'S1', items: [], traffic: { on: true, levels: [{ id: 'l', color: 'red', label: ' ' }] }, showUnanswered: false }, { id: '2', title: 'S2', items: [q('o', { type: 'choice', options: [' a ', ''] })] }] as Section[];
  const moved = removeSection(secs, 0);
  assert.equal(moved[0].showUnanswered, false);
  assert.ok(moved[0].traffic?.on);
  const clean = cleanForSave(secs);
  assert.deepEqual(clean[0].traffic?.levels, []);
  assert.deepEqual(clean[1].items[0].options, ['a']);
});
