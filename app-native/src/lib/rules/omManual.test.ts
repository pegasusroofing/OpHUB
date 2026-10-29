/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addrLines, buildDefaultOm, contractorRows, detectSystems, normalizeOm, scopeEmpty, type OmData } from './omManual.ts';

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
