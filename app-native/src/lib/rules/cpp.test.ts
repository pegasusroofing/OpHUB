/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blankCpp, cppMissing, durationDays, f10Needed, fillCpp, isCppHeading, normaliseCpp, outlineFromSow, pickHospital } from './cpp.ts';

test('CPP wording: names fill in, a line with nothing to fill is left out', () => {
  const p = blankCpp();
  p.pc.name = 'Acme Roofing Ltd'; p.client.name = 'Hyde Group'; p.siteName = 'Richardson Court';
  assert.equal(fillCpp('{company} works at {site} for {client}.', p), 'Acme Roofing Ltd works at Richardson Court for Hyde Group.');
  assert.equal(fillCpp('Waste.\n{company} licence {wasteLicence}.\nEnd.', p), 'Waste.\nEnd.');
  p.wasteLicence = 'CBDU1';
  assert.equal(fillCpp('{company} licence {wasteLicence}.', p), 'Acme Roofing Ltd licence CBDU1.');
  assert.match(fillCpp('{advisor} advises.', p), /^Our appointed health and safety advisor advises\.$/);
});

test('CPP: the template starts at section 2 and runs to 18; an old saved plan gets every field', () => {
  const p = blankCpp();
  assert.equal(p.sections[0].num, '2');
  assert.equal(p.sections[p.sections.length - 1].num, '18');
  const n = normaliseCpp({ siteName: 'X', pc: { name: 'Co' } as never });
  assert.equal(n.siteName, 'X'); assert.equal(n.pc.name, 'Co'); assert.equal(n.pc.phone, ''); assert.equal(n.version, 1); assert.ok(n.sections.length > 10);
});

test('CPP: F10 from the duration and workers', () => {
  assert.equal(durationDays('6 weeks'), 30);
  assert.equal(durationDays('45 days'), 45);
  assert.equal(durationDays('soon'), null);
  assert.equal(f10Needed('6 weeks', '6'), false);
  assert.equal(f10Needed('8 weeks', '25'), true); // over 30 days and over 20 at once
  assert.equal(f10Needed('20 weeks', '6'), true); // 100 days x 6 = 600 person days
  assert.equal(f10Needed('', '6'), null);
});

test('CPP: the outline from the Schedule of Works', () => {
  const o = outlineFromSow([{ id: 's1', name: 'Roof Strip' }, { id: 's2', name: 'New Roof' }], [{ name: 'Strip tiles', section_id: 's1' }, { name: 'Battens', section_id: 's2' }, { name: 'Skips', section_id: null }]);
  assert.equal(o, 'Roof Strip\n- Strip tiles\nNew Roof\n- Battens\nSkips');
});

test('CPP: nearest A&E prefers hospitals marked emergency=yes', () => {
  const site = { lat: 51.4613, lon: -0.1376 };
  const h = pickHospital(site, [
    { lat: 51.462, lon: -0.138, tags: { name: 'Small Clinic Hospital' } },
    { center: { lat: 51.468, lon: -0.094 }, tags: { name: "King's College Hospital", emergency: 'yes', 'addr:street': 'Denmark Hill', 'addr:city': 'London', 'addr:postcode': 'SE5 9RS', phone: '020 3299 9000' } },
  ]);
  assert.ok(h);
  assert.equal(h?.name, "King's College Hospital");
  assert.equal(h?.address, 'Denmark Hill, London, SE5 9RS');
  assert.equal(h?.phone, '020 3299 9000');
  assert.match(h?.distance || '', /miles/);
  assert.match(h?.route || '', /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(pickHospital(site, []), null);
});

test('CPP: sub-headings and what is missing', () => {
  assert.ok(isCppHeading('4.1 The Project (Additional Information)'));
  assert.ok(isCppHeading('In Case of Fire'));
  assert.ok(!isCppHeading('All waste will be suitably packed to ensure the safety of others.'));
  const p = blankCpp();
  assert.deepEqual(cppMissing(p), ['Principal Contractor', 'Site address', 'Outline of works', 'Nearest A&E', 'Emergency mobile']);
});
