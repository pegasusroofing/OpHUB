/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crc32, makeXlsx, sheetName, xlsxFiles } from './xlsx.ts';

test('xlsx: zip, sheet names, cells', () => {
  assert.equal(crc32(new TextEncoder().encode('abc')), 0x352441c2);
  const u = new Set<string>(); assert.equal(sheetName('Costs: a/b', u), 'Costs  a b'); assert.equal(sheetName('costs  a b', u), 'costs  a b 2');
  const f = xlsxFiles([{ name: 'T', rows: [[{ v: 'Name', s: 'head' }, 'A & B'], ['x', 12.5]] }]);
  const sh = f.find(([n]) => n === 'xl/worksheets/sheet1.xml')?.[1] || '';
  assert.match(sh, /<c r="B1" t="inlineStr"><is><t xml:space="preserve">A &amp; B<\/t>/); assert.match(sh, /<c r="B2"><v>12.5<\/v><\/c>/); assert.match(sh, /<c r="A1" s="2"/);
  const z = makeXlsx([{ name: 'T', rows: [['a']] }]);
  assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b); assert.equal(new DataView(z.buffer).getUint32(z.length - 22, true), 0x06054b50);
});
