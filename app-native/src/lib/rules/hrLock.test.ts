/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { HR_TRY_AGAIN, hrHolds, hrInside, hrItem, hrListingInside, hrLockFor, HrLockUnknown, hrNorm, hrPathInside, hrRel, type HrLock } from './hrLock.ts';

const lock: HrLock = { id: 'HR1', driveId: 'D1', path: '/company/hr private' };
const item = (id: string, name: string, path: string, driveId = 'D1') => ({ id, name, parentReference: { driveId, path } });

test('Graph paths come out lower case from the top of the drive', () => {
  assert.equal(hrNorm('/drives/D1/root:/Company/HR Private'), '/company/hr private');
  assert.equal(hrNorm('/drive/root:'), '');
  assert.equal(hrNorm('/drive/root:/A%20B/'), '/a b');
  assert.equal(hrNorm('/drive/root:/100%'), '/100%');
  assert.equal(hrNorm(undefined), null);
  assert.equal(hrRel('OpHUB Progress Reports/Site A/'), '/ophub progress reports/site a');
  assert.equal(hrRel(''), '');
});

test('the HR folder itself and everything under it are locked; its neighbours are not', () => {
  assert.equal(hrInside(lock, item('HR1', 'HR Private', '/drives/D1/root:/Company')), true);
  assert.equal(hrInside(lock, item('X', 'HR Private', '/drives/D1/root:/Company')), true, 'found by path too');
  assert.equal(hrInside(lock, item('X', 'Contract.pdf', '/drives/D1/root:/Company/HR Private/Andy Cramp/Contracts & Letters')), true);
  assert.equal(hrInside(lock, item('X', 'HR Private 2', '/drives/D1/root:/Company')), false, 'a folder whose name only starts the same');
  assert.equal(hrInside(lock, item('X', 'Jobs', '/drives/D1/root:/Company')), false);
  assert.equal(hrInside(lock, item('X', 'HR Private', '/drives/D2/root:/Company', 'D2')), false, 'same path in another drive');
  assert.equal(hrInside(null, item('HR1', 'HR Private', '/drives/D1/root:/Company')), false, 'no lock: nothing locked');
});

test('a shortcut to the HR folder (shared with me) is locked', () => {
  assert.equal(hrInside(lock, { id: 'S1', name: 'HR', remoteItem: { id: 'HR1' } }), true);
  assert.equal(hrInside(lock, { id: 'S1', name: 'HR', remoteItem: { id: 'R2', name: 'Inside', parentReference: { driveId: 'D1', path: '/drives/D1/root:/Company/HR Private' } } }), true);
});

test('a listing of the HR folder or a folder inside it is refused', () => {
  assert.equal(hrListingInside(lock, 'HR1', []), true, 'empty HR folder');
  assert.equal(hrListingInside(lock, 'P', [item('a', 'Andy Cramp', '/drives/D1/root:/Company/HR Private')]), true);
  assert.equal(hrListingInside(lock, 'P', [item('a', 'x.pdf', '/drives/D1/root:/Company/HR Private/Andy Cramp')]), true);
  assert.equal(hrListingInside(lock, 'P', [item('a', 'HR Private', '/drives/D1/root:/Company')]), false, 'the parent of the HR folder can be listed');
  assert.equal(hrListingInside(null, 'HR1', []), false);
});

test('a folder path to save into (uploads)', () => {
  assert.equal(hrPathInside(lock, 'D1', hrRel('Company/HR Private/Andy')), true);
  assert.equal(hrPathInside(lock, 'D1', hrRel('Company/HR Privateer')), false);
  assert.equal(hrPathInside(lock, 'D2', hrRel('Company/HR Private')), false);
  assert.equal(hrPathInside({ ...lock, path: null }, 'D1', '/company/hr private'), false, 'path unknown: only the id check');
  assert.equal(hrPathInside({ ...lock, path: '' }, 'D1', '/anything'), true, 'a whole drive chosen as the HR folder');
});

test('every server function carries the same lock as the app', () => {
  const block = (s: string) => {
    const a = s.indexOf('// ---- HR folder lock ----'), b = s.indexOf('// ---- end HR folder lock ----');
    assert.ok(a >= 0 && b > a, 'block markers');
    return s.slice(a, b).replace(/\r\n/g, '\n');
  };
  const mine = block(readFileSync(new URL('./hrLock.ts', import.meta.url), 'utf8'));
  for (const fn of ['onedrive-list-folders', 'onedrive-download-file', 'onedrive-upload', 'quote-tracker', 'sync-material-orders', 'sync-certifications']) {
    const file = new URL(`../../../../supabase/functions/${fn}/index.ts`, import.meta.url);
    assert.equal(block(readFileSync(file, 'utf8')), mine, fn);
  }
});

test('a move or copy that would carry the HR folder along is caught', () => {
  assert.equal(hrHolds(lock, item('C', 'Company', '/drives/D1/root:')), true, 'the folder the HR folder sits in');
  assert.equal(hrHolds(lock, item('HR1', 'HR Private', '/drives/D1/root:/Company')), true, 'the HR folder itself');
  assert.equal(hrHolds(lock, item('X', 'Andy', '/drives/D1/root:/Company/HR Private')), true, 'inside it');
  assert.equal(hrHolds(lock, item('X', 'Comp', '/drives/D1/root:')), false, 'a folder whose name only starts the same');
  assert.equal(hrHolds(lock, item('X', 'Jobs', '/drives/D1/root:/Company')), false, 'a neighbour');
  assert.equal(hrHolds(lock, item('C', 'Company', '/drives/D2/root:', 'D2')), false, 'same path in another drive');
  assert.equal(hrHolds({ ...lock, path: null }, item('C', 'Company', '/drives/D1/root:')), false, 'path unknown: only the id check');
  assert.equal(hrHolds(null, item('C', 'Company', '/drives/D1/root:')), false);
});

// hrLockFor and hrItem ask Microsoft; fetch is stood in for here.
const db = (onedrive: unknown) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onedrive } }) }) }) }) });
async function withFetch<T>(graph: (url: string) => Response | Promise<Response>, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request) => {
    const url = String(u);
    if (url.includes('/rpc/hr_is_team')) return new Response('false', { status: 200 });
    return graph(url);
  }) as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = real; }
}
const lockFor = () => hrLockFor(db({ id: 'HR1', driveId: 'D1' }), 'O1', 'ms', 'https://x.supabase.co', 'anon', 'user');

test('the HR folder found: locked by id and path', async () => {
  const l = await withFetch(() => Response.json({ id: 'HR1', name: 'HR Private', parentReference: { driveId: 'D1', path: '/drives/D1/root:/Company' } }), lockFor);
  assert.deepEqual(l, { id: 'HR1', driveId: 'D1', path: '/company/hr private' });
});

test('the HR folder gone (404): no lock', async () => {
  assert.equal(await withFetch(() => new Response('{}', { status: 404 }), lockFor), null);
});

test('Microsoft not answering: refused with "try again", never let through', async () => {
  for (const graph of [() => new Response('{}', { status: 503 }), () => new Response('{}', { status: 401 }), () => { throw new Error('network'); }, () => new Response('not json', { status: 200 })]) {
    await assert.rejects(withFetch(graph, lockFor), (e: unknown) => e instanceof HrLockUnknown && (e as Error).message === HR_TRY_AGAIN);
  }
});

test('no HR folder set, or the caller is let in: no lock and Microsoft is not asked', async () => {
  let asked = 0;
  assert.equal(await withFetch(() => { asked++; return new Response('{}'); }, () => hrLockFor(db(null), 'O1', 'ms', 'https://x', 'a', 'u')), null);
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request) => { if (String(u).includes('/rpc/hr_is_team')) return new Response('true'); asked++; return new Response('{}'); }) as typeof fetch;
  try { assert.equal(await lockFor(), null); } finally { globalThis.fetch = real; }
  assert.equal(asked, 0);
});

test('an item looked up for a check', async () => {
  const it = await withFetch(() => Response.json({ id: 'X', name: 'a.pdf', parentReference: { driveId: 'D1', path: '/drives/D1/root:/Company/HR Private' } }), () => hrItem('ms', 'D1', 'X'));
  assert.equal(hrInside(lock, it), true);
  assert.equal(await withFetch(() => new Response('{}', { status: 404 }), () => hrItem('ms', 'D1', 'X')), null);
  await assert.rejects(withFetch(() => new Response('{}', { status: 500 }), () => hrItem('ms', null, 'X')), HrLockUnknown);
});
