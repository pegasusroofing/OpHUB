import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanFolder, PACK_RULES, packProblem, startingPack, weekExample } from './jobPack.ts';

test('the starting set has every rule once, each pointing at a folder it makes', () => {
  const c = startingPack();
  assert.equal(new Set(PACK_RULES.map((r) => r.key)).size, PACK_RULES.length);
  assert.equal(Object.keys(c.rules).length, PACK_RULES.length);
  for (const r of PACK_RULES) {
    const f = r.folder.replace('/{week folder}', '');
    assert.ok(c.folders.includes(f), f);
  }
});
test('incidents start off, as they can hold personal details', () => { assert.equal(startingPack().rules.incident.on, false); });
test('week names match the template: Week 1 is folder 2', () => {
  const w = startingPack().weekly;
  assert.equal(weekExample(w, 1), '2. Week 1');
  assert.equal(weekExample(w, 5), '6. Week 5');
  assert.equal(weekExample({ ...w, addDate: true }, 1), '2. Week 1 (w-c 02 Nov 2026)');
});
test('typed folders are tidied', () => { assert.equal(cleanFolder(' A\\ B //C/ '), 'A/B/C'); });
test('says what stops the pack working', () => {
  assert.equal(packProblem(startingPack()), null);
  assert.match(packProblem({ ...startingPack(), parent_path: ' ' }) ?? '', /new job folders/);
  assert.match(packProblem({ ...startingPack(), template_path: '' }) ?? '', /template/);
  assert.equal(packProblem({ ...startingPack(), template_path: '', files: [] }), null);
  const c = startingPack(); c.weekly.name = 'Week';
  assert.match(packProblem(c) ?? '', /\{n\}/);
});
