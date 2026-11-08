/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { plainDbError, plainDbText } from './plainError.ts';

test('a blank required box becomes "please fill in"', () => {
  assert.equal(plainDbError('null value in column "value" of relation "fin_contract_items" violates not-null constraint'), 'Please fill in the value box.');
  assert.equal(plainDbError('null value in column "po_number" violates not-null constraint'), 'Please fill in the PO number box.');
  assert.match(plainDbError('null value in column "site_id" violates not-null constraint'), /Refresh the page/);
  assert.equal(plainDbError('null value in column "bank_sort_code" violates not-null constraint'), 'Please fill in the bank sort code box.');
});

test('duplicates, links, permissions, numbers, dates, sign-in and files', () => {
  assert.match(plainDbError('duplicate key value violates unique constraint "x_key"'), /already exists/);
  assert.match(plainDbError('update or delete on table "a" violates foreign key constraint "b"'), /still used/);
  assert.match(plainDbError('insert or update on table "a" violates foreign key constraint "b"'), /still used|no longer exists/);
  assert.match(plainDbError('insert on table "a" violates foreign key constraint "b"'), /no longer exists/);
  assert.equal(plainDbError('new row violates row-level security policy for table "fin_x"'), 'You don’t have permission to do that.');
  assert.match(plainDbError('invalid input syntax for type numeric: "abc"'), /number box/);
  assert.match(plainDbError('invalid input syntax for type date: "32/13"'), /dates/);
  assert.match(plainDbError('JWT expired'), /sign-in has run out/);
  assert.match(plainDbError('The object exceeded the maximum allowed size'), /too big/);
  assert.match(plainDbError('Could not find the \'foo\' column of \'bar\' in the schema cache'), /didn’t save/);
});

test('the app’s own wording is left alone', () => {
  assert.equal(plainDbError('Enter an address.'), 'Enter an address.');
  assert.equal(plainDbText('Choose a supplier first.'), 'Choose a supplier first.');
  assert.equal(plainDbText('This job has no client PO yet: add one now?'), 'This job has no client PO yet: add one now?');
});

test('"Could not save — <database text>" keeps its start', () => {
  assert.equal(plainDbText('Could not save — null value in column "title" violates not-null constraint'), 'Could not save — Please fill in the title box.');
  assert.equal(plainDbText('Upload failed: The object exceeded the maximum allowed size'), 'Upload failed: That file is too big to upload.');
});
