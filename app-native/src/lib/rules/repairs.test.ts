/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { approveStatus, matchesRepairSearch, progressMove, REPAIR_CATEGORIES, scaffoldMove, sortRepairs, surveyStatusMove, type RepairJob } from './repairs.ts';

const job = (p: Partial<RepairJob> = {}) => ({ id: 'j', job_status: 'To Survey', closed: false, invoiced: false, quote_approved: null, variation_issued_at: null, access_requirement: 'ladder', works_completed: false, ...p }) as RepairJob;

test('survey complete moves to costing; undone goes back', () => {
  assert.equal(surveyStatusMove(job(), 'Y'), 'Surveyed - Awaiting Cost');
  assert.equal(surveyStatusMove(job({ variation_issued_at: 'x' }), 'NA'), 'Surveyed - Variation Issued');
  assert.equal(surveyStatusMove(job({ job_status: 'Surveyed - Awaiting Cost' }), 'N'), 'To Survey');
  assert.equal(surveyStatusMove(job({ job_status: 'In Progress', quote_approved: true }), 'Y'), undefined);
});

test('approval, scaffold and progress moves', () => {
  assert.equal(approveStatus(job({ access_requirement: 'scaffold' })), 'Approved - Awaiting Scaffold');
  assert.equal(approveStatus(job({ access_requirement: 'tower' })), 'Approved - To Do');
  assert.equal(scaffoldMove(job({ job_status: 'Approved - Awaiting Scaffold' }), '2026-11-01'), 'Approved - To Do');
  assert.equal(scaffoldMove(job({ job_status: 'Approved - To Do', access_requirement: 'scaffold' }), null), 'Approved - Awaiting Scaffold');
  assert.equal(progressMove(job({ job_status: 'Approved - To Do' }), 'started'), 'In Progress');
  assert.equal(progressMove(job({ job_status: 'Approved - To Do' }), ''), undefined);
});

test('tiles, sort and search', () => {
  assert.ok(REPAIR_CATEGORIES.to_invoice.match(job({ closed: true, invoiced: false })));
  assert.ok(!REPAIR_CATEGORIES.survey.match(job({ closed: true })));
  const l = [job({ id: 'a', address: 'B St', job_number: '10', created_at: '2026-01-02' }), job({ id: 'b', address: 'A St', job_number: '9', created_at: '2026-01-01' })];
  assert.deepEqual(sortRepairs(l, 'name_asc').map((x) => x.id), ['b', 'a']);
  assert.deepEqual(sortRepairs(l, 'job_number_asc').map((x) => x.id), ['b', 'a']);
  assert.ok(matchesRepairSearch(l[0], 'b st'));
});
