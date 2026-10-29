// Cost splits (917): the maths the split box uses.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitAcross, splitEven, splitFoot, splitMode, splitPatch, splitStart } from './finSplit.ts';

const m = (v: number) => `£${v.toFixed(2)}`;
test('start from the saved split, or where it goes now', () => {
  assert.deepEqual(splitStart({ split: [{ site_id: 'S', sub_job_id: 'p1', pct: 60 }, { site_id: 'S', pct: 40 }] }, []), [{ site_id: 'S', sub: 'p1', v: 60 }, { site_id: 'S', sub: '', v: 40 }]);
  assert.deepEqual(splitStart({}, [{ site_id: 'S', sub: null, share: 1 }]), [{ site_id: 'S', sub: '', v: 100 }]);
});
test('even split puts the penny on the last line', () => {
  const r = splitEven([{ site_id: 'S', sub: 'a', v: 0 }, { site_id: 'S', sub: 'b', v: 0 }, { site_id: 'S', sub: 'c', v: 0 }], 100);
  assert.deepEqual(r.map((x) => x.v), [33.33, 33.33, 33.34]);
  assert.deepEqual(splitAcross('S', ['a', 'b'], 250).map((x) => x.v), [125, 125]);
});
test('switching % ⇄ £', () => {
  assert.deepEqual(splitMode([{ site_id: 'S', sub: 'a', v: 50 }, { site_id: 'S', sub: 'b', v: 50 }], 'gbp', 333).map((x) => x.v), [166.5, 166.5]);
  assert.equal(splitFoot([{ site_id: 'S', sub: 'a', v: 80 }], true, null, m).text, 'Still to allocate: 20%');
});
test('what gets saved', () => {
  assert.deepEqual(splitPatch([{ site_id: 'S', sub: 'p1', v: 100 }], 'S', true, 500, m).patch, { sub_job_id: 'p1', split: null });
  const p = splitPatch([{ site_id: 'S', sub: 'p1', v: 100 }, { site_id: 'T', sub: '', v: 200 }], 'S', false, 300, m).patch!;
  assert.deepEqual(p.split.map((x: Record<string, unknown>) => [x.site_id, x.pct, x.amount]), [['S', 33.3333, 100], ['T', 66.6667, 200]]);
  assert.match(splitPatch([{ site_id: 'S', sub: '', v: 90 }], 'S', true, null, m).error!, /add up to 100%/);
  assert.match(splitPatch([{ site_id: 'S', sub: 'a', v: 50 }, { site_id: 'S', sub: 'a', v: 50 }], 'S', true, null, m).error!, /two lines/);
});
