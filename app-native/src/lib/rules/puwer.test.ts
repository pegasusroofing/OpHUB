/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPuwerTools, toolPasses } from './puwer.ts';

const all = (v: boolean) => ({ q_suitability: v, q_guarding: v, q_controls: v, q_maintenance: v, q_markings: v });

test('toolPasses needs every box', () => {
  assert.equal(toolPasses(all(true)), true);
  assert.equal(toolPasses({ ...all(true), q_guarding: false }), false);
});

test('buildPuwerTools: saved first, new tools unticked for operatives, ticked for managers', () => {
  const saved = [{ id: 'r1', tool_id: 't1', name: 'Drill', serial_number: null, photo_path: null, ...all(true) }];
  const owned = [{ id: 't1', name: 'Drill', serial_number: null, photo_path: null }, { id: 't2', name: 'Saw', serial_number: 'S9', photo_path: null }];
  const op = buildPuwerTools(saved, owned, false);
  assert.deepEqual(op.map((t) => [t.name, t.dbId, t.q_guarding]), [['Drill', 'r1', true], ['Saw', null, false]]);
  assert.equal(buildPuwerTools([], owned, true)[1].q_markings, true);
});
