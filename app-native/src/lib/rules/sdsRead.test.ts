/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coshhBlank } from './coshh.ts';
import { applySds, dropRepeats, readSds } from './sdsRead.ts';

const SDS = `SECTION 1: Identification of the substance/mixture and of the company/undertaking
1.1 Product identifier
Product name: Bauder Primer K
1.2 Relevant identified uses
Identified uses: Bitumen primer for roofing membranes
1.3 Details of the supplier
Company name: Bauder Ltd.
SECTION 2: Hazards identification
Signal word: Danger
GHS02 GHS07 GHS08
H225 Highly flammable liquid and vapour.
H304 May be fatal if swallowed and enters airways.
H315 Causes skin irritation.
P210 Keep away from heat.
SECTION 3: Composition/information on ingredients
Naphtha
SECTION 4: First aid measures
4.1 Description of first aid measures
Inhalation: Move to fresh air.
Skin contact: Wash with soap and water.
4.2 Most important symptoms
Headache.
SECTION 5: Firefighting measures
5.1 Extinguishing media
Foam, dry powder.
SECTION 8: Exposure controls/personal protection
NAPHTHA (PETROLEUM)
WEL GBR 1200 - - -
Wear suitable gloves and safety glasses.
SECTION 13: Disposal considerations
13.1 Waste treatment methods
Dispose of as hazardous waste.`;

test('SDS reader: codes, symbols, signal, product, maker, sections, WEL, PPE; filling a blank product', () => {
  const f = readSds(SDS);
  assert.deepEqual(f.h, ['H225', 'H304', 'H315']); assert.deepEqual(f.p, ['P210']);
  assert.deepEqual(f.pictos, ['GHS02', 'GHS07', 'GHS08']); assert.equal(f.signal, 'Danger');
  assert.equal(f.product, 'Bauder Primer K'); assert.equal(f.manufacturer, 'Bauder Ltd'); assert.equal(f.use, 'Bitumen primer for roofing membranes');
  assert.match(f.firstAid, /^Inhalation: Move to fresh air\.\nSkin contact: Wash with soap and water\.$/);
  assert.match(f.wel, /^Naphtha \(petroleum\): 1200 mg\/m³ \(8hr\)$/);
  assert.deepEqual(f.ppe, ['hand', 'eye']); assert.match(f.disposal, /Dispose of as hazardous waste/);
  const r = applySds('New product', coshhBlank(), f);
  assert.equal(r.title, 'Bauder Primer K'); assert.ok(r.n > 8); assert.ok(r.d.routes.includes('swallow') && r.d.routes.includes('skin'));
  assert.equal(dropRepeats(['Head\na', 'Head\nb', 'Head\nc', 'Page 2 of 3']), 'a\nb\nc\n');
});
