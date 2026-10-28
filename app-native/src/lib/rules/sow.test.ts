/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allDone, completePatch, doneCount, filterTasks, oneDriveName, overallPct, photoPaths, photoStage,
  sectionVisible, siteConditionSaved, snapPct, statusPatch, tasksForAddress,
} from './sow.ts';

test('overallPct: done 100, progress its %, todo 0', () => {
  assert.equal(overallPct([]), 0);
  assert.equal(overallPct([{ status: 'done', percent_complete: null }, { status: 'progress', percent_complete: 50 }, { status: 'todo', percent_complete: 90 }]), 50);
  assert.equal(overallPct([{ status: 'progress', percent_complete: 250 }]), 100);
});

test('filterTasks', () => {
  const t = [{ status: 'todo' }, { status: 'progress' }, { status: 'done' }];
  assert.equal(filterTasks(t, 'active').length, 2);
  assert.equal(filterTasks(t, 'done').length, 1);
  assert.equal(filterTasks(t, 'all').length, 3);
});

test('tasksForAddress keeps untagged tasks and this address', () => {
  const t = [{ sub_site_id: null }, { sub_site_id: 'a' }, { sub_site_id: 'b' }];
  assert.equal(tasksForAddress(t, 'a', false).length, 2);
  assert.equal(tasksForAddress(t, 'a', true).length, 3);
  assert.equal(tasksForAddress(t, null, false).length, 3);
});

test('snapPct', () => {
  assert.equal(snapPct(44), 40);
  assert.equal(snapPct(45), 50);
  assert.equal(snapPct(-5), 0);
  assert.equal(snapPct(140), 100);
});

test('statusPatch clears completion; To Commence also clears %', () => {
  assert.deepEqual(statusPatch('progress'), { status: 'progress', completed_at: null });
  assert.deepEqual(statusPatch('todo'), { status: 'todo', completed_at: null, percent_complete: null });
  const p = completePatch(new Date('2026-10-28T10:00:00Z'));
  assert.deepEqual(p, { status: 'done', completed_at: '2026-10-28T10:00:00.000Z', percent_complete: 100 });
});

test('photoStage', () => {
  assert.equal(photoStage('done'), 'done');
  assert.equal(photoStage('progress'), 'progress');
  assert.equal(photoStage(null), 'todo');
});

test('sectionVisible', () => {
  assert.equal(sectionVisible('all', 0, 0, false), true);
  assert.equal(sectionVisible('done', 1, 3, false), true);
  assert.equal(sectionVisible('done', 0, 3, true), false);
  assert.equal(sectionVisible('active', 0, 0, true), true);
  assert.equal(sectionVisible('active', 0, 0, false), false);
});

test('siteConditionSaved reopens when a task is added later', () => {
  const flag = { closeout_saved_at: '2026-10-20T00:00:00Z' };
  assert.equal(siteConditionSaved(null, []), false);
  assert.equal(siteConditionSaved(flag, [{ created_at: '2026-10-19T00:00:00Z' }]), true);
  assert.equal(siteConditionSaved(flag, [{ created_at: '2026-10-21T00:00:00Z' }]), false);
});

test('photoPaths and oneDriveName match the old app', () => {
  assert.deepEqual(photoPaths('s', 't', 'abc'), { full: 's/schedule/t/abc.jpg', mid: 's/schedule/t/abc_m.jpg', thumb: 's/schedule/t/abc_t.jpg' });
  assert.equal(oneDriveName('Fit lead (front)!', new Date('2026-10-28T09:05:00Z'), 'abcd1234'), 'Fit lead front 2026-10-28-09-05 abcd.jpg');
  assert.equal(oneDriveName('!!!', new Date('2026-10-28T09:05:00Z'), 'abcd'), 'Photo 2026-10-28-09-05 abcd.jpg');
});

test('allDone and doneCount', () => {
  assert.equal(allDone([]), false);
  assert.equal(allDone([{ status: 'done' }, { status: 'done' }]), true);
  assert.equal(allDone([{ status: 'done' }, { status: 'todo' }]), false);
  assert.equal(doneCount([{ status: 'done' }, { status: 'todo' }]), '1/2 done');
});

test('nextVariationName', async () => {
  const { nextVariationName } = await import('./sow.ts');
  assert.equal(nextVariationName([]), 'Variation 1');
  assert.equal(nextVariationName(['Roof', 'variation 2', 'Variation 7 ', 'Variation x']), 'Variation 8');
});

test('moveTask keeps done and open tasks apart', async () => {
  const { moveTask } = await import('./sow.ts');
  const t = (id: string, position: number, status = 'todo', section_id: string | null = null) => ({ id, position, status, section_id });
  const all = [t('a', 0), t('b', 1, 'done'), t('c', 2), t('x', 0, 'todo', 's1')];
  assert.deepEqual(moveTask(all, 'c', -1), { changes: [{ id: 'c', position: 0 }, { id: 'a', position: 1 }, { id: 'b', position: 2 }] });
  assert.deepEqual(moveTask(all, 'a', -1), { message: 'Already at the top.' });
  assert.deepEqual(moveTask(all, 'b', 1), { message: 'Already at the bottom.' });
  assert.deepEqual(moveTask(all, 'x', 1), { message: 'Already at the bottom.' });
});
