/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { barState, bookedFor, byBooking, operativeJobs, repairStage, type RJob } from './repairStages.ts';

const j = (o: Partial<RJob>): RJob => ({ id: o.id || 'x', ...o });

test('the old repair statuses land on the new stages', () => {
  assert.equal(repairStage(j({ job_status: 'To Survey' })), 'to_book');
  assert.equal(repairStage(j({ job_status: 'To Survey', survey_booking_date: '2026-11-10' })), 'booked');
  assert.equal(repairStage(j({ job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y' })), 'quote_needed');
  assert.equal(repairStage(j({ job_status: 'Surveyed - Variation Issued', survey_required: 'Y', variation_issued_at: '2026-11-01' })), 'awaiting_approval');
  assert.equal(repairStage(j({ job_status: 'Approved - To Do', survey_required: 'Y', quote_approved: true })), 'approved');
  assert.equal(repairStage(j({ job_status: 'Approved - Awaiting Scaffold', survey_required: 'Y', quote_approved: true, works_booking_date: '2026-11-14' })), 'works_booked');
  assert.equal(repairStage(j({ job_status: 'Awaiting Sign-off', works_completed: true })), 'done');
  assert.equal(repairStage(j({ job_status: 'Closed', closed: true })), 'done');
  assert.equal(repairStage(j({ job_status: 'Rejected', quote_approved: false })), 'rejected');
  // Moved on by the old app's status alone (no boxes ticked).
  assert.equal(repairStage(j({ job_status: 'Closed', survey_required: 'Y' })), 'done');
  assert.equal(repairStage(j({ job_status: 'Approved - Awaiting Scaffold', survey_required: 'NA' })), 'approved');
  assert.equal(repairStage(j({ job_status: 'Surveyed - Variation Issued', survey_required: 'Y' })), 'awaiting_approval');
});

test('new jobs: attended, fixed first time or needs a quote', () => {
  assert.equal(repairStage(j({ survey_required: 'Y' })), 'attended');
  assert.equal(repairStage(j({ survey_required: 'Y', completed_in_visit: true })), 'attended');
  assert.equal(repairStage(j({ survey_required: 'Y', completed_in_visit: false })), 'quote_needed');
  const fixed = barState(j({ survey_required: 'Y', completed_in_visit: true, works_completed: true }));
  assert.deepEqual([fixed.step, fixed.skipQuote], [7, true]);
  assert.equal(barState(j({ works_completed: true, quote_approved: true }), { status: 'issued' }).step, 8);
  assert.equal(barState(j({ works_completed: true }), { status: 'paid' }).step, 9);
  assert.equal(barState(j({ works_completed: true }), { status: 'draft' }).step, 7);
});

test('an operative sees their jobs, soonest first; all of them when nobody is booked on any', () => {
  const jobs = [
    j({ id: 'a', survey_booking_date: '2026-11-12', survey_booking_assigned_to: 'me' }),
    j({ id: 'b', survey_booking_date: '2026-11-10', survey_booking_assigned_to: 'me' }),
    j({ id: 'c', survey_booking_date: '2026-11-09', survey_booking_assigned_to: 'other' }),
    j({ id: 'd', quote_approved: true, survey_required: 'Y', works_booking_date: '2026-11-11', works_booking_assigned_to: 'me' }),
    j({ id: 'e', works_completed: true, survey_booking_assigned_to: 'me' }),
  ];
  const r = operativeJobs(jobs, 'me', false);
  assert.deepEqual(r.list.map((x) => x.id), ['b', 'd', 'a']);
  assert.equal(r.all, 4);
  assert.deepEqual(operativeJobs(jobs, 'me', true).list.map((x) => x.id), ['c', 'b', 'd', 'a']);
  const none = operativeJobs([j({ id: 'p' }), j({ id: 'q' })], 'me', false);
  assert.equal(none.fallback, true);
  assert.equal(none.list.length, 2);
  assert.equal(bookedFor(jobs[3]), '2026-11-11');
  assert.deepEqual(byBooking([j({ id: 'n', created_at: '2026-11-01' }), j({ id: 'm', survey_booking_date: '2026-11-20' })]).map((x) => x.id), ['m', 'n']);
});
