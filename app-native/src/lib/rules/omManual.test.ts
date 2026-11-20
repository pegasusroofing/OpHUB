/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addOmProducts, addrLines, buildDefaultOm, contractorRows, detectSystems, ensureTeam, nextRevision, normalizeOm, omChecklist, omFromCpp, omTab, printSections, scopeEmpty, syncOmCoshh, syncOmDocs, teamSec, tradeNeutral, type OmCpp, type OmData } from './omManual.ts';

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

// The builder in tabs, with the Construction Phase Plan (Andy, 20 Nov 2026).
const job = (cpp: OmCpp | null) => buildDefaultOm({
  site: { name: 'Studley Rd', client_name: '', job_number: 'J101' }, address: '', company: 'RTB', today: '2026-11-20',
  settings: { address: 'Unit 1', phone: '01234' }, pm: { name: '', email: '', phone: null }, myEmail: '',
  schedSections: [], tasks: [], docs: [], coshh: [], drawings: [], photos: [], cpp,
});
const plan: OmCpp = {
  pc: { name: 'RTB Roofing Ltd', address: 'Unit 1\nYard Lane', phone: '01234 567890', email: 'office@rtb.co' },
  client: { name: 'Bellway Homes', address: '', phone: '0207 000', email: 'site@bellway.co', contact: 'Sam Jones' },
  clientAgent: 'Pellings LLP', principalDesigner: 'Stace LLP', architect: 'N/A',
  pm: { name: 'Pat PM', phone: '07700 900000', email: 'pat@rtb.co' }, startDate: '2026-09-01', outline: 'Main roof\n- Strip and re-felt',
  siteAddress: '1 High St\nCM3 8DQ', contacts: [{ role: 'Principal Designer', name: 'Stace', day: '0203 111', ooh: '' }],
};

test('O&M: a new manual takes the people, dates and outline from the Construction Phase Plan', () => {
  const d = job(plan);
  const team = teamSec(d);
  const row = (re: RegExp) => team?.rows?.find((r) => re.test(r[0]));
  assert.deepEqual(row(/^Client$/), ['Client', 'Bellway Homes (Sam Jones)', '0207 000', 'site@bellway.co']);
  assert.deepEqual(row(/Principal Designer/), ['Principal Designer', 'Stace LLP', '0203 111', '']);
  assert.equal(row(/Agent/)?.[1], 'Pellings LLP'); assert.equal(row(/Architect/)?.[1], 'N/A');
  assert.deepEqual(row(/Project Manager/), ['Project Manager', 'Pat PM', '07700 900000', 'pat@rtb.co']);
  assert.equal(d.dates?.start, '2026-09-01');
  assert.equal(d.cover.address, '1 High St, CM3 8DQ');
  assert.equal(d.sections.find((s) => s.key === 'scope')?.body, 'Main roof\n- Strip and re-felt', 'no Schedule of Works: the outline is the scope');
  const so = d.sections.find((s) => /sign-off/i.test(s.title));
  assert.deepEqual(so?.rows?.[0], ['Name', 'Pat PM', 'Sam Jones']);
  const cd = contractorRows(d);
  assert.equal(cd.find((r) => r[0] === 'Client')?.[1], 'Bellway Homes');
  assert.equal(cd.find((r) => r[0] === 'Email')?.[1], 'pat@rtb.co');
  // Each section sits on a tab.
  assert.deepEqual(d.sections.map((s) => omTab(s)), ['people', 'details', 'works', 'works', 'works', 'works', 'works', 'works', 'works', 'issue', 'people', 'people']);
});

test('O&M: filling from the plan again never overwrites what was typed', () => {
  const d = job(null);
  const team = ensureTeam(d);
  assert.equal(team, teamSec(d), 'a new manual already has its Project Team');
  (team.rows as string[][])[0][1] = 'Typed Client';
  const n = omFromCpp(d, plan);
  assert.ok(n > 5);
  assert.equal(team.rows?.[0][1], 'Typed Client');
  assert.equal(omFromCpp(d, plan), 0, 'a second fill finds nothing empty');
  // An older manual without a Project Team gets one, before Contacts.
  const old: OmData = { cover: {}, attach: {}, appendix: [], sections: [{ id: 'c', type: 'table', title: 'Contacts', columns: ['', 'RTB'], rows: [['Contact name', '']] }] };
  omFromCpp(old, plan);
  assert.deepEqual(old.sections.map((s) => s.key || s.title), ['team', 'Contacts']);
  assert.equal(old.sections[1].rows?.[0][1], 'Pat PM');
});

test('O&M: checklist, printed sections and revision numbers', () => {
  const d = job(null);
  const c = omChecklist(d, { pcDate: null });
  assert.deepEqual(c.filter((x) => !x.ok).map((x) => x.key), ['scope', 'pc', 'client', 'pd', 'mat', 'guar', 'sign']);
  assert.equal(c.find((x) => x.key === 'scope')?.must, true);
  const d2 = job(plan);
  assert.deepEqual(omChecklist(d2, { pcDate: '2026-11-20' }).filter((x) => !x.ok).map((x) => x.key), ['mat', 'guar']);
  // Unnamed roles are left out of the PDF; no names at all and the table goes.
  assert.equal(printSections(d).some((s) => s.key === 'team'), false);
  assert.deepEqual(printSections(d2).find((s) => s.key === 'team')?.rows?.map((r) => r[0]), ['Client', 'Client’s Agent', 'Principal Designer', 'Architect', 'Principal Contractor', 'Project Manager']);
  assert.equal(nextRevision(d), '1');
  d.revisions = [{ rev: '1', date: '2026-11-20', by: 'Pat', note: 'First issue' }];
  assert.equal(nextRevision(d), '2');
});

test('O&M: a subcontractor’s manual starts trade-neutral', () => {
  const d = job(null);
  tradeNeutral(d);
  assert.match(d.sections.find((s) => /introduction/i.test(s.title))?.body || '', /handover of the completed works at/);
  assert.deepEqual(d.sections.find((s) => s.type === 'maint')?.items?.map((i) => [i.title, i.text]), [['Maintenance', '']]);
  assert.doesNotMatch(d.sections.find((s) => /health & safety/i.test(s.title))?.body || '', /roof|torch-on|rooflight/i);
});
