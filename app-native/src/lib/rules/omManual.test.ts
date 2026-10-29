/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addOmProducts, addrLines, buildDefaultOm, contractorRows, detectSystems, normalizeOm, scopeEmpty, syncOmCoshh, syncOmDocs, type OmData } from './omManual.ts';

test('O&M: systems, address lines, default manual, tidy old manuals', () => {
  assert.deepEqual(detectSystems('Torch-on cap sheet, lead flashings, new cast gutter'), ['general', 'felt', 'lead', 'rainwater']);
  assert.deepEqual(addrLines('1 High St, Chelmsford, CM3 8DQ'), ['1 High St, Chelmsford', 'CM3 8DQ']);
  const d = buildDefaultOm({
    site: { name: 'Studley Rd', client_name: 'Bellway', job_number: 'J101' }, address: '1 High St, CM3 8DQ', company: 'RTB', today: '2026-10-29',
    settings: { address: 'Unit 1\nYard', phone: '01234' }, pm: { name: 'Pat', email: 'p@x.co', phone: null }, myEmail: 'me@x.co',
    schedSections: [{ id: 'a', name: 'Main roof' }], tasks: [{ id: 't', name: 'Strip and re-felt', status: 'done', section_id: 'a' }],
    docs: [{ id: 'd1', kind: 'datasheet', name: 'Bauder K5.pdf', provider: 'Bauder', ref: null, expiry_date: null, maintenance: null }],
    coshh: [{ name: 'COSHH — Bauder K5.pdf', storage_path: 'x.pdf' }], drawings: [], photos: [],
  });
  assert.match(d.sections.find((s) => s.key === 'scope')?.body || '', /Main roof:\na\.  Strip and re-felt/);
  const mat = d.sections.find((s) => s.type === 'materials');
  assert.equal(mat?.rows?.length, 1); assert.equal(mat?.links?.[0].length, 2);
  assert.ok(d.sections.find((s) => s.type === 'maint')?.items?.some((i) => i.key === 'felt'));
  assert.equal(contractorRows(d).length, 6); assert.equal(scopeEmpty(d), false);
  const old: OmData = { cover: {}, attach: undefined as never, appendix: undefined as never, sections: [{ id: '1', type: 'table', title: 'Materials Log', columns: ['a'], rows: [['x']] }, { id: '2', type: 'text', title: 'Maintenance', body: 'Leadwork\nCheck it' }] };
  assert.equal(normalizeOm(old), true);
  assert.equal(old.sections[0].type, 'materials'); assert.equal(old.sections[1].type, 'maint'); assert.equal(old.sections[1].items?.[0].key, 'lead');
  assert.ok(old.sections.some((s) => s.key === 'scope')); assert.equal(old.attach.coshh, true);
});

test('O&M: documents and COSHH added after the manual started are brought in once; library products added', () => {
  const d: OmData = { cover: {}, attach: {}, appendix: [], sections: [
    { id: 'm', type: 'materials', title: 'Materials Log', columns: ['Log No.', 'Element', 'Product', 'Manufacturer'], rows: [['1', '', 'Bauder K5', 'Bauder']], links: [[{ docId: 'd1', name: 'Bauder K5.pdf' }]] },
    { id: 'g', type: 'table', title: 'Guarantees & Warranties', columns: ['Item', 'Ref', 'Expiry', 'Maintenance'], rows: [['', '', '', '']], links: [[]] },
  ] };
  assert.equal(syncOmDocs(d, [{ id: 'd1', kind: 'datasheet', name: 'Bauder K5.pdf' }]), true);
  assert.equal(d.sections[0].rows?.length, 1); // first time: only noted
  syncOmDocs(d, [{ id: 'd1', kind: 'datasheet', name: 'Bauder K5.pdf' }, { id: 'd2', kind: 'guarantee', name: 'Roof guarantee.pdf', provider: 'Bauder', ref: 'G1', expiry_date: '2046-10-29' }, { id: 'd3', kind: 'datasheet', name: 'Primer.pdf', provider: 'Sika' }]);
  assert.deepEqual(d.sections[1].rows?.[0], ['Bauder – Roof guarantee', 'G1', '29/10/2046', '']);
  assert.deepEqual(d.sections[0].rows?.[1], ['2', '', 'Primer', 'Sika']);
  assert.equal(syncOmDocs(d, [{ id: 'd3', kind: 'datasheet', name: 'Primer.pdf' }]), false); // never twice
  syncOmCoshh(d, [{ id: 'c1', name: 'COSHH Assessment — Bauder K5.pdf', storage_path: 'c1.pdf' }, { id: 'c2', name: 'COSHH — Lead sealant.pdf', storage_path: 'c2.pdf' }]);
  assert.equal(d.sections[0].links?.[0].length, 2); // linked to the existing row
  assert.equal(d.sections[0].rows?.[2][2], 'Lead sealant');
  assert.equal(addOmProducts(d, 'm', [{ title: 'Primer', manufacturer: '', sdsPath: 'x', assessPath: null }, { title: 'Gripfill', manufacturer: 'Everbuild', sdsPath: 'g.pdf', assessPath: 'ga.pdf' }]), 1);
  assert.equal(d.sections[0].links?.[3].length, 2);
});
