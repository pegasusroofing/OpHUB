/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { programmeDates } from './programmeDates.ts';
import { dateStyleIds, sheetRows } from './xlsxRead.ts';

test('programme key dates: date-styled cells, labels left then right, old years and repeats skipped', () => {
  const styles = '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;£&quot;#,##0.00"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="165"/></cellXfs>';
  const ds = dateStyleIds(styles);
  assert.deepEqual([...ds], [1, 2]);
  const xml = '<sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>Strip roof</t></is></c><c r="B1" s="1"><v>46327</v></c></row>'
    + '<row r="2"><c r="A2" s="2"><v>46357</v></c><c r="B2" t="inlineStr"><is><t>Scaffold down</t></is></c></row>'
    + '<row r="3"><c r="A3" t="inlineStr"><is><t>Old</t></is></c><c r="B3" s="1"><v>1000</v></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t>Price</t></is></c><c r="B4" s="3"><v>46327</v></c></row>'
    + '<row r="5"><c r="A5" t="inlineStr"><is><t>Strip roof</t></is></c><c r="B5" s="1"><v>46327</v></c></row>'
    + '</sheetData>';
  const rows = sheetRows(xml, [], ds);
  assert.equal(rows[0][1], '2026-11-01');
  assert.equal(rows[3][1], 46327);
  assert.deepEqual(programmeDates([{ rows }]), [{ date: '2026-11-01', label: 'Strip roof' }, { date: '2026-12-01', label: 'Scaffold down' }]);
});
