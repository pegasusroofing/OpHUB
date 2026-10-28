/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { answerText, isAnswered, itemVisible, reportListsItem, reportListsSection, scoreLabel, scoreSections, weekKeyOf, weekLabelOf } from './reports.ts';

test('isAnswered', () => {
  assert.equal(isAnswered(''), false);
  assert.equal(isAnswered('  '), false);
  assert.equal(isAnswered([]), false);
  assert.equal(isAnswered(false), true);
  assert.equal(isAnswered(0), true);
});

test('itemVisible: showIf by value, by list, by "not blank", booleans as Yes/No', () => {
  const it = { id: 'b', type: 'text', label: 'B', showIf: { qId: 'a', values: ['Fail'] } };
  assert.equal(itemVisible(it, { a: 'Fail' }), true);
  assert.equal(itemVisible(it, { a: 'Pass' }), false);
  assert.equal(itemVisible({ ...it, showIf: { qId: 'a', values: ['Yes'] } }, { a: true }), true);
  assert.equal(itemVisible({ ...it, showIf: { qId: 'a', values: ['x'] } }, { a: ['y', 'x'] }), true);
  assert.equal(itemVisible({ ...it, showIf: { qId: 'a', mode: 'notblank' } }, { a: '' }), false);
});

test('unanswered questions hidden only when the template says so', () => {
  const it = { id: 'q', type: 'text', label: 'Q' };
  const hide = [{ id: 's', title: 'S', items: [it], showUnanswered: false }];
  const show = [{ id: 's', title: 'S', items: [it] }];
  assert.equal(reportListsItem(show, it, {}), true);
  assert.equal(reportListsItem(hide, it, {}), false);
  assert.equal(reportListsItem(hide, it, { q__note: 'x' }), true);
  assert.equal(reportListsSection(hide, hide[0], {}), false);
});

test('scoring leaves N/A out', () => {
  const sections = [{ id: 's', title: 'S', items: [
    { id: 'a', type: 'passfail', label: 'A', scored: true },
    { id: 'b', type: 'passfail', label: 'B', scored: true },
    { id: 'c', type: 'checkbox', label: 'C', scored: true },
    { id: 'd', type: 'passfail', label: 'D' },
  ] }];
  const r = scoreSections(sections, { a: 'Pass', b: 'N/A', c: false, d: 'Fail' });
  assert.deepEqual(r.overall, { earned: 1, possible: 2 });
  assert.equal(scoreLabel(r.overall), '1 / 2 (50%)');
});

test('answerText', () => {
  assert.equal(answerText({ id: 'x', type: 'passfail', label: '' }, 'Pass'), 'Yes');
  assert.equal(answerText({ id: 'x', type: 'passfail', label: '', pfWords: true }, 'Pass'), 'Pass');
  assert.equal(answerText({ id: 'x', type: 'checkbox', label: '' }, false), 'No');
  assert.equal(answerText({ id: 'x', type: 'multichoice', label: '' }, ['a', 'b']), 'a, b');
  assert.equal(answerText({ id: 'x', type: 'text', label: '' }, ''), '—');
});

test('briefing weeks start on Monday', () => {
  assert.equal(weekKeyOf(new Date(2026, 10, 1)), '2026-10-26'); // Sun 1 Nov
  assert.equal(weekKeyOf(new Date(2026, 9, 26)), '2026-10-26');
  assert.equal(weekLabelOf('2026-10-26'), 'Week of 26 Oct – 01 Nov');
});

import { completeProblem, itemOptions, itemTrafficLevel, mediaRequiredFor } from './reports.ts';
test('filling-in rules', () => {
  const secs = [{ id: 's', title: 'S', traffic: { on: true, levels: [{ id: 'g', color: 'green', label: 'OK' }] }, items: [
    { id: 'a', type: 'passfail', label: 'Ladder', required: true, mediaRequiredWhen: ['Fail'] },
    { id: 'b', type: 'choice', label: 'Kind', options: ['x'] },
    { id: 'c', type: 'signature', label: 'Sign', required: true },
  ] }];
  assert.equal(completeProblem(secs, {}, true), '"Ladder" is required.');
  assert.equal(completeProblem(secs, { a: 'Fail' }, true), 'A photo is required for "Ladder" based on your answer.');
  assert.equal(completeProblem(secs, { a: 'Pass' }, false), 'Adopt your signature before submitting.');
  assert.equal(completeProblem(secs, { a: 'Pass', c: 'sig.png' }, true), null);
  assert.equal(mediaRequiredFor(secs[0].items[0], { a: 'Pass' }), false);
  assert.deepEqual(itemOptions(secs[0].items[1], { b__opts: ['y', 'x'] }), ['x', 'y']);
  assert.equal(itemTrafficLevel(secs, secs[0].items[1], { b__tl: 'g' })?.label, 'OK');
  assert.equal(itemTrafficLevel(secs, secs[0].items[2], { c__tl: 'g' }), null);
});
