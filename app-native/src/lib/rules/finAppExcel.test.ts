// Application Excel (9219p): the workbook round-trips — download, the client edits, upload.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appDoc, appExcelSheets, appSummary, applyAppUpload, certFromItems, parseAppBook } from './finAppExcel.ts';
import { makeXlsx } from './xlsx.ts';
import { readXlsx } from './xlsxRead.ts';

const app = {
  id: 'a2', number: 2, status: 'draft', retention_pct: 5, discount_pct: 0, previous: 1000,
  lines: [{ kind: 'section', item_id: 'h1', description: 'Main Roof' }, { kind: 'item', item_id: 'i1', description: 'Tiling', qty: 300, unit: 'm2', rate: 120, value: 36000, pct: 50 }, { kind: 'item', item_id: 'i2', description: 'Ridge', value: 12000, pct: 0 }],
  variations: [{ variation_id: 'sv1', description: 'Fascia', value: 850, pct: 100 }],
  dayworks: [{ description: 'Storm repairs', value: 640 }],
};
const jf = { contract_value: 48000, retention_limit_pct: 0, vat_treatment: 'standard' };
const apps = [{ number: 1, status: 'certified', lines: [{ kind: 'item', item_id: 'i1', pct: 20 }], cert_lines: [{ item_id: 'i1', pct: 25 }], variations: [] }];

test('summary: applied side matches the application maths', () => {
  const S = appSummary(app, appDoc(app, jf, apps));
  assert.equal(S.applied.gross, 18000 + 850 + 640);
  assert.equal(S.applied.ret, 974.5);
  assert.equal(S.applied.due, 19490 - 974.5 - 1000);
  assert.equal(S.applied.vat, Math.round(S.applied.due * 0.2 * 100) / 100);
});

test('Excel out and back in: keys, prev certified, applied and certified %', async () => {
  const D = appDoc(app, jf, apps);
  assert.equal(D.prevPct.i1, 25); // from the certified lines, not the applied %
  const sheets = appExcelSheets(app, D, { company: 'RTB', client: 'C', project: 'P', jobNo: 'J1', valDate: '' });
  assert.deepEqual(sheets.map((s) => s.name), ['General Summary', 'Main Roof', 'Variations', 'Dayworks']);
  const book = await readXlsx(makeXlsx(sheets));
  const items = parseAppBook(book)!;
  assert.ok(items);
  const tiling = items.find((i) => i.key === 'L:i1')!;
  assert.equal(tiling.applied, 50); assert.equal(tiling.certified, 50); assert.equal(tiling.amount, 36000);
  // The client certifies 40% of tiling and adds nothing; we raise Ridge to 10% and add a new line.
  tiling.certified = 40;
  items.find((i) => i.key === 'L:i2')!.applied = 10;
  items.push({ key: '', sheet: 'Main Roof', head: 'h1', ref: '', desc: 'Lead flashing', qty: null, unit: '', rate: null, amount: 500, applied: 100, certified: 100 });
  const up = applyAppUpload(app, items);
  assert.equal(up.changed, 1);
  assert.equal(up.a.lines[2].pct, 10);
  assert.equal(up.newLines.length, 1); assert.equal(up.newLines[0].under, 'h1'); assert.equal(up.newLines[0].value, 500);
  const c = certFromItems(app, items);
  assert.equal(c.found, 4); assert.equal(c.cp.l1, '40'); assert.equal(c.cp.v0, '100'); assert.equal(c.cp.d0, '640');
  assert.deepEqual(c.diffs, ['Tiling: 50% → 40%']);
});

test('not an OpHUB application workbook', () => {
  assert.equal(parseAppBook([{ name: 'Sheet1', rows: [['Description', 'Value']] }]), null);
});
