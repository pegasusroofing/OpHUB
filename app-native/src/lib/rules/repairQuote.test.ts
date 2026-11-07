/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lineValue, parseRates, parseScheduleSheets, quoteTotals, rateLine, rateTitle, titleWords, vatFor } from './repairQuote.ts';

test('a repair quote: schedule of rates less the discount, typed lines in full, VAT once at the bottom', () => {
  const lines = [
    rateLine({ id: 'r1', code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45 }, 4), // 180
    { description: 'Lead flashing (typed in)', qty: 1, rate: 120 },
  ];
  assert.equal(lineValue(lines[0], 10), 162);
  assert.equal(lineValue(lines[1], 10), 120);
  const t = quoteTotals(lines, 10, 'standard');
  assert.deepEqual([t.sorGross, t.discount, t.net, t.vat, t.total], [180, 18, 282, 56.4, 338.4]);
  const rc = quoteTotals(lines, 0, 'reverse_charge');
  assert.deepEqual([rc.net, rc.vat, rc.total], [300, 0, 300]);
  assert.match(rc.vatNote, /reverse charge/);
  assert.equal(vatFor(null).pct, 20);
});

test('an NHF workbook: sheet = category, rows with no rate = headings, code / title / unit / rate', () => {
  const r = parseScheduleSheets([
    { name: 'Pitched Roofing', rows: [['', 'ROOFING', '', ''], ['', 'Clay/Concrete Roof Tiling\r\nConcrete Interlocking Tiles to Match Existing', '', ''],
      ['2011BB', 'ROOF TILE:REMOVE AND REFIX INTERLOCKING NE 5 NO\r\nRoof Tile:Remove and refix loose concrete interlocking tiles.', 'IT', 16.56],
      ['ITEM', 'DESCRIPTION', 'UNIT', 'RATE'], ['', 'Concrete Plain Tiles', '', ''], ['2013AA', 'TILE:RENEW PLAIN CONCRETE FELT AND BATTENS\r\nTile:Renew any plain concrete roof tiles.', 'SM', '£197.36']] },
    // The other version: no codes, the heading has Unit / Rate beside it.
    { name: 'Fascia, Soffit, Gutters', rows: [['ROOFLINE SCHEDULE OF WORKS', '', '', ''], ['Fascias, Soffits and Bargeboards - PVCu', 'UNIT', 'RATE'], ['FASCIA:RENEW IN PVCU NE 300MM\r\nFascia/Barge:Renew fascia.', 'LM', 40.12], ['UPLIFT FOR VENTED SOFFIT', 'LM', 13.81]] },
  ]);
  assert.equal(r.length, 4);
  assert.deepEqual(r[0], { code: '2011BB', description: 'ROOF TILE:REMOVE AND REFIX INTERLOCKING NE 5 NO\nRoof Tile:Remove and refix loose concrete interlocking tiles.', unit: 'IT', rate: 16.56, category: 'Pitched Roofing', section: 'Concrete Interlocking Tiles to Match Existing', title: 'ROOF TILE:REMOVE AND REFIX INTERLOCKING NE 5 NO' });
  assert.deepEqual([r[1].code, r[1].section, r[1].rate], ['2013AA', 'Concrete Plain Tiles', 197.36]);
  assert.deepEqual([r[2].code, r[2].category, r[2].section, r[2].unit], [null, 'Fascia, Soffit, Gutters', 'Fascias, Soffits and Bargeboards - PVCu', 'LM']);
  assert.deepEqual([r[3].title, r[3].description], [null, 'UPLIFT FOR VENTED SOFFIT']);
  assert.equal(rateTitle({ ...r[0] }), 'Roof Tile: Remove And Refix Interlocking NE 5 No');
  assert.equal(rateLine({ id: 'x', ...r[2] }).description, 'Fascia: Renew In PVCu NE 300mm');
  assert.equal(titleWords('Already Mixed case'), 'Already Mixed case');
});

test('rates read from a table: code, description, unit, rate; header skipped', () => {
  const r = parseRates([['Code', 'Description', 'Unit', 'Rate'], ['RF101', 'Replace slipped tile', 'nr', '£45.00'], ['', 'Clear gutters', 'm', 3.5], ['junk']]);
  assert.deepEqual(r, [{ code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45 }, { code: null, description: 'Clear gutters', unit: 'm', rate: 3.5 }]);
});
