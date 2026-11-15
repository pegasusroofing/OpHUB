/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isTimedRead, READ_TIMEOUT_MS } from './readTimeout.ts';

const B = 'https://x.supabase.co';
test('only reads of database tables are timed', () => {
  assert.equal(isTimedRead(`${B}/rest/v1/sites?select=*`, 'GET'), true);
  assert.equal(isTimedRead(`${B}/rest/v1/sites?select=id`, 'HEAD'), true);
  assert.equal(READ_TIMEOUT_MS, 12000);
});
test('saves, database functions, files, sign-in and server functions are never cut short', () => {
  assert.equal(isTimedRead(`${B}/rest/v1/sites`, 'POST'), false, 'an insert');
  assert.equal(isTimedRead(`${B}/rest/v1/sites?id=eq.1`, 'PATCH'), false, 'an update');
  assert.equal(isTimedRead(`${B}/rest/v1/sites?id=eq.1`, 'DELETE'), false, 'a delete');
  assert.equal(isTimedRead(`${B}/rest/v1/rpc/hr_my_access`, 'POST'), false, 'a database function');
  assert.equal(isTimedRead(`${B}/rest/v1/rpc/onedrive_status`, 'GET'), false, 'a database function called by GET');
  assert.equal(isTimedRead(`${B}/storage/v1/object/site-photos/a.jpg`, 'GET'), false, 'a file download');
  assert.equal(isTimedRead(`${B}/storage/v1/object/site-photos/a.jpg`, 'POST'), false, 'an upload');
  assert.equal(isTimedRead(`${B}/functions/v1/onedrive-upload`, 'POST'), false, 'a server function');
  assert.equal(isTimedRead(`${B}/auth/v1/token?grant_type=password`, 'POST'), false, 'sign-in');
  assert.equal(isTimedRead(`${B}/auth/v1/user`, 'GET'), false, 'who am I');
});
