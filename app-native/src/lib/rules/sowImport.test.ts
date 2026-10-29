/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { columnTasks, pdfTaskLines, sheetColumns } from './sowImport.ts';

test('SoW import: picks the scope column, skips blanks, tidies PDF lines', () => {
  const c = sheetColumns([['Ref', '', 'Qty'], ['1.1', 'Strip existing tiles', 20], ['1.2', 'Fit new battens', 30], ['', '', '']]);
  assert.deepEqual(c.headers, ['Ref', 'Column B', 'Qty']);
  assert.equal(c.guess, 1);
  assert.deepEqual(columnTasks(c.data, c.guess), ['Strip existing tiles', 'Fit new battens']);
  assert.equal(sheetColumns([['Item', 'Scope of works'], ['1', 'x']]).guess, 0);
  assert.deepEqual(pdfTaskLines(['Schedule of Works', 'Page 2', '12', 'Re-point chimney', 'ok']), ['Re-point chimney']);
});
