/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hoKindOf, hoSameName, hoSkipFolder } from './handoverFind.ts';
import { boqScope, boqHasWorks } from './omManual.ts';

test('OneDrive files: guarantees and data sheets by name or folder', () => {
  assert.equal(hoKindOf('Bauder 20yr Guarantee.pdf', 'J101/Handover'), 'guarantee');
  assert.equal(hoKindOf('Workmanship Warranty.PDF', 'J101'), 'guarantee');
  assert.equal(hoKindOf('IBG certificate.pdf', 'J101'), 'guarantee');
  assert.equal(hoKindOf('Cert 1234.pdf', 'J101/Handover/Warranties'), 'guarantee');
  assert.equal(hoKindOf('Sika Data Sheet.pdf', 'J101'), 'datasheet');
  assert.equal(hoKindOf('Kingspan DoP.pdf', 'J101'), 'datasheet');
  assert.equal(hoKindOf('Thermaroof TP10.pdf', 'J101/O&M/Technical Data Sheets'), 'datasheet');
  assert.equal(hoKindOf('BBA certificate.jpg', 'J101'), 'datasheet');
  assert.equal(hoKindOf('Warranty data sheet.pdf', 'J101'), 'guarantee');
  assert.equal(hoKindOf('Guarantee terms.docx', 'J101'), null);
  assert.equal(hoKindOf('Invoice 7781.pdf', 'J101/Accounts'), null);
  assert.equal(hoKindOf('Drawing rev B.pdf', 'J101/Drawings'), null);
});

test('photo folders are skipped; names compare loosely', () => {
  assert.equal(hoSkipFolder('Survey Photos'), true);
  assert.equal(hoSkipFolder('Completion Photos'), true);
  assert.equal(hoSkipFolder('Warranties'), false);
  assert.equal(hoSameName(' Bauder  Guarantee.pdf', 'bauder guarantee.pdf'), true);
});

test('the O&M scope from the Bill of Quantities: headings, items and quantities, no prices', () => {
  const boq = [
    { id: '1', position: 0, kind: 'section', ref: null, section: null, description: 'Main Roof', qty: null, unit: null },
    { id: '2', position: 1, kind: 'item', ref: '1.1', section: null, description: 'Strip existing felt', qty: 120, unit: 'm²' },
    { id: '3', position: 2, kind: 'item', ref: '1.2', section: null, description: 'Bauder 2-layer system', qty: 120.5, unit: 'm²' },
    { id: '4', position: 3, kind: 'subsection', ref: null, section: null, description: 'Edges', qty: null, unit: null },
    { id: '5', position: 4, kind: 'item', ref: '1.3', section: null, description: 'Lead drip', qty: 0, unit: 'm' },
    { id: '6', position: 5, kind: 'note', ref: null, section: null, description: 'Prices exclude VAT', qty: null, unit: null },
  ];
  const s = boqScope(boq);
  assert.match(s, /^The following works were carried out to Main Roof:\na\. {2}Strip existing felt \(120 m²\)\nb\. {2}Bauder 2-layer system \(120\.5 m²\)/);
  assert.match(s, /The following works were carried out to Main Roof — Edges:\na\. {2}Lead drip$/);
  assert.doesNotMatch(s, /Prices exclude VAT|£/);
  assert.equal(boqHasWorks(boq), true);
  assert.equal(boqHasWorks([{ id: 'x', position: 0, kind: 'section', ref: null, section: null, description: 'Roof', qty: null, unit: null }]), false);
  assert.match(boqScope([{ id: 'a', position: 0, kind: 'item', ref: null, section: 'Gutters', description: 'Replace gutter', qty: 30, unit: 'm' }]), /carried out to Gutters:\na\. {2}Replace gutter \(30 m\)/);
});
