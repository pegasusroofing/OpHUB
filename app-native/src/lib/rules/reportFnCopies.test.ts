// Auto-run reports run a copy of the app's report code on the server. This fails if the copy is out of date.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

test('the server copy of the reports matches the app', () => {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '../../../../tools/sync-report-fn.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
