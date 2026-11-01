import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseJobPack, RULE_KEYS } from './jobPack.ts';

const where = { parent_path: 'Live Projects', template_path: 'Live Projects/- Template' };
const book = (over: Record<string, (string | number)[][]> = {}) => [
  { name: 'Read me', rows: [['New Job Pack']] },
  { name: 'Folders', rows: [['Folders'], ['intro'], [], ['Folder', 'Make it?'], ['1. Contract', 'Yes'], ['2. Skip', 'No']] },
  { name: 'Template files', rows: [['t'], ['i'], [], ['In folder', 'File', 'Copy to new job?'], ['(top of the job folder)', 'Check.xlsx', 'Yes'], ['2. H&S/TBT', 'Talk.pdf', 'No']] },
  { name: 'Auto sync', rows: [['t'], ['i'], [], ['App area', 'When', 'What is sent', 'To this folder', 'File name', 'On?'], ['RAMS', 'RAMS issued', 'x', '2. H&S/1. RAMS', 'y', 'Yes'], ['Incidents', 'Incident submitted', 'x', 'Near Miss', 'y', 'No']] },
  { name: 'Weekly folders', rows: [['t'], ['i'], [], ['Rule', 'Setting'], ['Name of each week folder', '{order}. Week {n}'], ['Add the date to the name?', 'No'], ['Week starts on', 'Monday'], ['Week 1 starts', 'Job start date']] },
  ...Object.entries(over).map(([name, rows]) => ({ name, rows })),
];

test('reads the folders, files, rules and weekly settings marked Yes', () => {
  const r = parseJobPack(book(), where);
  assert.ok('config' in r);
  assert.deepEqual(r.config.folders, ['1. Contract']);
  assert.deepEqual(r.config.files, [{ folder: '', name: 'Check.xlsx' }]);
  assert.deepEqual(r.config.rules.rams_issued, { on: true, folder: '2. H&S/1. RAMS' });
  assert.equal(r.config.rules.incident.on, false);
  assert.deepEqual(r.config.weekly, { name: '{order}. Week {n}', addDate: false, weekStart: 1, week1: 'start' });
});
test('says what is wrong rather than half-loading', () => {
  const a = parseJobPack([{ name: 'Sheet1', rows: [] }], where);
  assert.ok('error' in a && a.error.includes('Auto sync'));
  const b = book(); b[3] = { name: 'Auto sync', rows: [['App area', 'When', 'To this folder', 'On?'], ['RAMS', 'Reworded', 'x', 'Yes']] };
  const c = parseJobPack(b, where);
  assert.ok('error' in c && c.error.includes('RAMS: Reworded'));
});
test('every rule has its own name', () => { assert.equal(new Set(Object.values(RULE_KEYS)).size, Object.keys(RULE_KEYS).length); });
