/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { makeXlsx } from './xlsx.ts';
import { csvRows, readXlsx, unzip } from './xlsxRead.ts';

test('reads back an Excel file made by the app (stored zip)', async () => {
  const sheets = await readXlsx(makeXlsx([{ name: 'Statement', rows: [['Date', 'Ref', 'Amount'], ['01/10/2026', 'INV-1 & 2', 125.5], [], ['', '', 3]] }]));
  assert.equal(sheets[0].name, 'Statement');
  assert.deepEqual(sheets[0].rows, [['Date', 'Ref', 'Amount'], ['01/10/2026', 'INV-1 & 2', 125.5], [], ['', '', 3]]);
});

test('unzips deflated entries (as Excel saves them) and shared strings', async () => {
  const enc = new TextEncoder();
  const files: [string, string][] = [
    ['xl/workbook.xml', '<workbook><sheets><sheet name="BoQ" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Item</t></si><si><r><t>Re-</t></r><r><t>slate</t></r></si></sst>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>2.5</v></c></row><row r="2"><c r="B2" t="s"><v>1</v></c></row></sheetData></worksheet>'],
  ];
  // build a zip with deflate (method 8)
  const parts: Uint8Array[] = [], cen: Uint8Array[] = []; let off = 0;
  for (const [n, x] of files) {
    const nb = enc.encode(n), data = deflateRawSync(enc.encode(x)), raw = enc.encode(x);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nb, data); cen.push(c, nb); off += 30 + nb.length + data.length;
  }
  const csize = cen.reduce((t, b) => t + b.length, 0), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(csize, 12); e.writeUInt32LE(off, 16);
  const zip = new Uint8Array(Buffer.concat([...parts, ...cen, e]));
  assert.equal(Object.keys(await unzip(zip)).length, 4);
  const [s] = await readXlsx(zip);
  assert.equal(s.name, 'BoQ'); assert.deepEqual(s.rows, [['Item', '', 2.5], ['', 'Re-slate']]);
});

test('csv rows', () => {
  assert.deepEqual(csvRows('a,"b, c","d ""q"""\r\n1,2,3'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
});
