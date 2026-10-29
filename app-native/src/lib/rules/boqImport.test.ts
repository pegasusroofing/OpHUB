/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestSheet, boqRows, guessColumns, importPdfLines, importRows } from './boqImport.ts';

test('BoQ from a spreadsheet: columns by heading, sections, items, totals skipped, lump sums', () => {
  const rows = [
    ['Studley Rd — Roofing', '', '', '', '', ''],
    ['Ref', 'Description', 'Qty', 'Unit', 'Rate', 'Total'],
    ['A', 'MAIN ROOF', '', '', '', ''],
    ['A.1', 'Strip and re-slate', 120, 'm2', 45, 5400],
    ['A.2', 'Lead flashings', '', '', '', 1250],
    ['A.3', 'Ridge', 30, 'lm', 20, 999],
    ['', 'Sub-total', '', '', '', 7649],
  ];
  const g = guessColumns(rows);
  assert.equal(g.header, 1); assert.deepEqual(g.cols, { desc: 1, ref: 0, qty: 2, unit: 3, rate: 4, amount: 5, cost: -1 });
  const lines = importRows(rows, g.header, g.cols);
  assert.deepEqual(lines.map((l) => [l.kind, l.description, l.value ?? null]), [['section', 'MAIN ROOF', null], ['item', 'Strip and re-slate', 5400], ['item', 'Lead flashings', 1250], ['item', 'Ridge', 999], ['skip', 'Sub-total', 7649]]);
  const out = boqRows(lines);
  assert.equal(out.length, 4); assert.equal(out[3].qty, ''); assert.equal(out[3].value, 999); assert.equal(out[1].qty, 120);
  assert.equal(bestSheet([{ name: 'Cover', rows: [['x']] }, { name: 'BoQ', rows }]).name, 'BoQ');
});

test('BoQ from PDF lines', () => {
  const l = importPdfLines(['PITCHED ROOF', 'Strip and re-slate 120 m2 45.00 5,400.00', 'Scaffold 3,200.00', 'Total 8,600.00']);
  assert.deepEqual(l.map((x) => [x.kind, x.description, x.value ?? null]), [['section', 'PITCHED ROOF', null], ['item', 'Strip and re-slate', 5400], ['item', 'Scaffold', 3200], ['skip', 'Total', 8600]]);
});
