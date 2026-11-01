import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoRefs } from './boqRefs.ts';

const k = (...kinds: string[]) => kinds.map((kind) => ({ kind }));

test('sections, their lines, sub-sections and their lines', () => {
  assert.deepEqual(autoRefs(k('section', 'item', 'item', 'subsection', 'item', 'item', 'section', 'item')), ['1', '1.1', '1.2', '1.3', '1.3.1', '1.3.2', '2', '2.1']);
});
test('a second sub-section carries on, and old numbers are replaced', () => {
  assert.deepEqual(autoRefs([{ kind: 'section', ref: '7' }, { kind: 'subsection', ref: '' }, { kind: 'item', ref: '9.9' }, { kind: 'subsection' }, { kind: 'item' }]), ['1', '1.1', '1.1.1', '1.2', '1.2.1']);
});
test('lines before any section number on their own', () => {
  assert.deepEqual(autoRefs(k('item', 'item', 'section', 'item')), ['1', '2', '1', '1.1']);
});
test('a ref typed with letters stays', () => {
  assert.deepEqual(autoRefs([{ kind: 'section' }, { kind: 'item', ref: 'A1' }, { kind: 'item' }]), ['1', 'A1', '1.2']);
});
