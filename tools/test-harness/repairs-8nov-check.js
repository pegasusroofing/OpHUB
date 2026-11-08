// Repairs, Andy's 8 Nov 2026 changes, on a laptop (1366 wide), fake database:
// Works Orders — no Bulk Add button (New Job's "Upload Works Order/Orders" takes one or several), Export Excel in a footer
// bar, a box opened shows in the trail like a folder (Works Orders › Quotation Required) and the trail closes it again;
// a job — the trail (Works Orders › its box › the job), Client and Works Order half and half, Booking Date opens the booking
// pop-up (date, time slot, operative, notes), Attended opens Update Status (date, who, fault, repair, photos), Reports &
// Photos on the Job tab, the Work Summary tab with the booking's slot and notes, Resident (not Tenant), Booking Visit
// Report, and a PM's Delete Visit. node repairs-8nov-check.js
const fs = require('fs');
const path = require('path');
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const BASE = 'http://localhost:8081';
const fns = [];
global.__fn = (name, b) => { fns.push([name, b]); return name === 'onedrive-repair-folder' ? {ok: true} : {ok: true}; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  Object.assign(s, {repair_contract: true, name: 'Sovereign Repairs', client_name: 'Sovereign Housing', client_contact_name: 'Jo Bloggs'});
  const op = db.profiles.find((p) => p.role === 'operative');
  db.repair_jobs = [
    {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', tenant_name: 'Mr K Hughes', tenant_phone: '07700 900456', job_status: 'To Survey', survey_required: 'N', survey_booking_date: day(1), survey_booking_assigned_to: op ? op.id : null, work_order_path: 'x/wo.pdf', work_order_name: 'WO-1002.pdf', created_at: '2026-11-05T09:00:00Z'},
    {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, fault_description: 'Slipped tiles', repair_description: 'Refix 4 tiles', created_at: '2026-11-03T09:00:00Z'},
  ];
  db.repair_job_photos = [{id: 'ph2', repair_job_id: 'j2', category: 'survey', storage_path: 'x/p2.jpg', deleted_at: null}];
  db.repair_job_notes = []; db.site_calendar_events = db.site_calendar_events || [];
  await ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
  await ctx.route('**/api.postcodes.io/**', (r) => r.abort());
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Works Orders ----
  await page.goto(`${BASE}/sites/${S1}/repairs`); await page.waitForTimeout(5000);
  let t = await text();
  check(!/Bulk Add/.test(t), 'no Bulk Add button any more');
  check(/2 Jobs/.test(t) && await page.getByRole('button', {name: 'Export Excel'}).count() === 1, 'footer bar: how many jobs and Export Excel');
  await page.getByLabel(/^Quotation Required, /).click(); await page.waitForTimeout(1200);
  t = await text();
  check(/box=quote_needed/.test(page.url()) && /Works Orders › Quotation Required/.test(t) && /WO-1003/.test(t), `a box opened shows in the trail like a folder (${page.url().split('?')[1] || ''})`);
  await page.screenshot({path: 'shots/repairs-box-trail.png'});
  // The trail's "Works Orders" (not the page title above it): the lowest one on the page.
  const wos = page.locator('text="Works Orders" >> visible=true'); let lowest = null, ly = -1;
  for (let i = 0; i < await wos.count(); i++) { const b = await wos.nth(i).boundingBox(); if (b && b.y > ly) { ly = b.y; lowest = wos.nth(i); } }
  await lowest.click(); await page.waitForTimeout(1500);
  check(!/box=/.test(page.url()) && /Tap a box to see its jobs/.test(await text()), 'Works Orders in the trail goes back to the boxes');
  await page.getByText('+ New Job (Read Works Order)', {exact: true}).click(); await page.waitForTimeout(600);
  const up = page.getByRole('button', {name: '📎 Upload Works Order/Orders'});
  check(await up.count() === 1, 'New Job: one button, Upload Works Order/Orders');
  const ub = await up.boundingBox(), nb = await page.getByLabel('Works Order Number').boundingBox();
  check(!!ub && !!nb && nb.y - (ub.y + ub.height) >= 10, `room under the upload bar (${ub && nb ? Math.round(nb.y - (ub.y + ub.height)) : '?'}px)`);
  check(await page.getByPlaceholder('Resident Name', {exact: true}).count() === 1 && await page.getByPlaceholder('Resident Contact Number').count() === 1, 'New Job: Resident Name and Resident Contact Number');
  await page.screenshot({path: 'shots/repairs-newjob.png'});
  const pdf = fs.readFileSync(path.join(__dirname, 'shots', 'samples', 'sample.pdf'));
  const fc = page.waitForEvent('filechooser'); await up.click();
  await (await fc).setFiles([{name: 'WO-2001.pdf', mimeType: 'application/pdf', buffer: pdf}, {name: 'WO-2002.pdf', mimeType: 'application/pdf', buffer: pdf}]);
  await page.waitForTimeout(6000);
  check(db.repair_jobs.length === 4, `several works orders at once: a job each (${db.repair_jobs.length - 2} added)`);

  // ---- a job ----
  await page.goto(`${BASE}/sites/${S1}/repairs/job/j2`); await page.waitForTimeout(5000);
  t = await text();
  check(/Works Orders › Scheduled - Awaiting Attendance › WO-1002/.test(t), 'job trail: Works Orders › its box › the job');
  check(/CLIENT Sovereign Housing/.test(t) && /WORKS ORDER WO-1002 View ›/.test(t), 'Client, and the works order: its number and View');
  const cb = await page.getByLabel('Client', {exact: true}).boundingBox();
  check(!!cb && cb.width > 400 && cb.width < 560, `half and half (${cb ? Math.round(cb.width) : '?'})`);
  check(/Resident Mr K Hughes/.test(t) && !/Tenant/.test(t) && /Booking Date/.test(t) && !/Booked For/.test(t), 'Resident, and Booking Date');
  await page.getByLabel(/^Booking Date: /).click(); await page.waitForTimeout(800);
  check(await page.getByLabel('Time Slot').count() === 1 && await page.getByLabel('Notes For The Booking').count() === 1 && await page.getByLabel('Operative').count() === 1, 'Booking Date opens the pop-up: date, time slot, operative, notes');
  await page.getByLabel('Time Slot').click(); await page.waitForTimeout(400); await menu('AM (8am – 12pm)').click(); await page.waitForTimeout(300);
  await page.getByLabel('Notes For The Booking').fill('Key safe 1234');
  await page.screenshot({path: 'shots/repairs-booking-popup.png'});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  let j2 = db.repair_jobs.find((j) => j.id === 'j2');
  check(j2.survey_booking_slot === 'AM (8am – 12pm)' && j2.survey_booking_notes === 'Key safe 1234', 'the slot and notes are saved');
  check(db.site_calendar_events.some((e) => /^Booked In \(AM\): 3 Mill Lane/.test(e.title || '')), 'the calendar shows the slot');
  check(/· AM ·/.test(await text()), 'Booking Date shows the slot');
  await page.getByLabel(/^Attended: /).click(); await page.waitForTimeout(800);
  t = await text();
  check(/Update Status/.test(t) && await page.getByLabel('Date Attended').count() === 1 && await page.getByLabel('Attended By').count() === 1 && await page.getByRole('button', {name: '📷 Upload Photos'}).count() === 1, 'Attended opens Update Status: date, who, and the photo upload in the pop-up');
  check(await page.getByRole('button', {name: 'Delete Visit'}).count() === 0, 'no Delete Visit before there is a visit');
  await page.getByLabel('Description Of Fault Found').fill('Cracked lead to porch');
  await page.screenshot({path: 'shots/repairs-update-status.png'});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  j2 = db.repair_jobs.find((j) => j.id === 'j2');
  check(j2.survey_required === 'Y' && !!j2.survey_date && j2.fault_description === 'Cracked lead to porch' && !!j2.surveyed_by, 'Update Status saves the visit');
  t = await text();
  check(/REPORTS & PHOTOS/.test(t) && /Booking Visit Report/.test(t) && /Cracked lead to porch/.test(t) && !/Attendance Report/.test(t), 'Job tab: the report and the photos once in');
  await page.screenshot({path: 'shots/repairs-job-laptop.png', fullPage: true});
  await page.getByRole('tab', {name: /^Work Summary/}).click(); await page.waitForTimeout(700);
  t = await text();
  check(/Booking/.test(t) && /Notes For The Booking Key safe 1234/.test(t) && /AM/.test(t) && !/Survey Photos/.test(t), 'Work Summary: the booking with its slot and notes; photos are added in Update Status');
  await page.screenshot({path: 'shots/repairs-work-summary.png', fullPage: true});
  await page.getByRole('button', {name: 'Update Status'}).first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', {name: 'Delete Visit'}).click(); await page.waitForTimeout(500);
  await menu('Delete Visit').click(); await page.waitForTimeout(2000);
  j2 = db.repair_jobs.find((j) => j.id === 'j2');
  const ph = db.repair_job_photos.find((p) => p.id === 'ph2');
  check(j2.survey_required === 'N' && !j2.survey_date && !j2.fault_description && j2.job_status === 'To Survey' && !!ph.deleted_at, 'Delete Visit: back to Scheduled, its photo to Deleted Photos');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
