// Repairs, Andy's later list of 8 Nov 2026, on the fake database, phone (375 wide) then laptop: Finance › Live Jobs has
// tabs (Live Jobs | Costs By Job | Schedule Of Rates); the boxes are all the same size; a box opens a page of its own with
// a drop-down to jump to another, the jobs in a table; Back returns to the boxes; the footer is one line (jobs, Export
// Excel). A job: Quoted / Costs / Profit open pop-ups; a cost is booked to the job and one added from it; Work Summary has
// ‹ Job Page; Quote Update ▾ (Rejected And Close Job closes it); Attended By comes from the operative who uploaded the
// visit photos. Costs By Job offers Book A Cost To It. node repairs-money-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const setup = (db) => {
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true; db.organizations[0].has_finance = true;
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  Object.assign(s, {repair_contract: true, name: 'Sovereign Repairs', client_name: 'Sovereign Housing'});
  Object.assign(db.job_finance.find((x) => x.site_id === S1) || {}, {billing_type: 'invoice'});
  db.repair_jobs = [
    {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', job_status: 'To Survey', survey_required: 'N', survey_booking_date: '2026-11-10', created_at: '2026-11-05T09:00:00Z'},
    {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, variation_cost: 500, quote_lines: [{description: 'Refix tiles', qty: 1, rate: 500}], created_at: '2026-11-03T09:00:00Z'},
    {id: 'j6', org_id: O, site_id: S1, job_number: 'WO-1006', address: '2 Ash Way', description: 'Valley leak', job_status: 'Surveyed - Variation Issued', survey_required: 'Y', survey_date: '2026-11-02T10:00:00Z', completed_in_visit: false, variation_cost: 300, variation_issued_at: '2026-11-03T10:00:00Z', created_at: '2026-11-01T09:00:00Z'},
  ];
  // The visit photo on j2 was uploaded by an operative (o1, Jake Morris).
  db.repair_job_photos = [{id: 'ph2', repair_job_id: 'j2', category: 'survey', storage_path: 'x/p2.jpg', uploaded_by: 'o1', deleted_at: null}];
  db.repair_job_notes = []; db.site_calendar_events = [];
  // A skip for the contract, not booked to a job yet.
  db.fin_job_costs = [{id: 'c1', org_id: O, site_id: S1, category: 'other', cost_date: '2026-11-06', description: 'Skip hire', supplier: 'Biffa', net: 180, vat: 36, sub_job_id: null, split: null}];
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 375, height: 812}});
  setup(db);
  await ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
  await ctx.route('**/api.postcodes.io/**', (r) => r.abort());
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Phone: Finance › Live Jobs ----
  await page.goto(`${BASE}/fin/job/${S1}/repairs`); await page.waitForTimeout(6000);
  let t = await text();
  check(/Live Jobs/.test(t) && /Costs By Job/.test(t) && /Schedule Of Rates/.test(t), 'phone: tabs Live Jobs, Costs By Job, Schedule Of Rates');
  const hs = [];
  for (const l of ['Overdue', 'To Schedule', 'Scheduled - Awaiting Attendance', 'Approved - Requires Booking Date', 'Completed Works - Paid', 'All Jobs']) { const b = await page.getByLabel(new RegExp(`^${l.replace(/[-/]/g, '.')}, `)).boundingBox(); if (b) hs.push([Math.round(b.width), Math.round(b.height)]); }
  check(hs.length === 6 && hs.every(([w, h]) => Math.abs(w - hs[0][0]) <= 2 && Math.abs(h - hs[0][1]) <= 2), `phone: every box the same size (${hs.map((x) => x.join('×')).join(', ')})`);
  check(await page.getByRole('button', {name: 'Export Excel'}).count() === 1 && /3 Jobs/.test(t), 'phone: footer is the jobs and Export Excel');
  const fb = await page.getByRole('button', {name: 'Export Excel'}).boundingBox();
  check(!!fb && fb.x + fb.width <= 375, 'phone: Export Excel fits on the screen');
  await page.screenshot({path: 'shots/fin-livejobs-phone.png'});
  await page.getByLabel(/^Quotation Required, /).click(); await page.waitForTimeout(1500);
  t = await text();
  check(/box=quote_needed/.test(page.url()) && /ORDER NO ADDRESS BOOKED/.test(t) && /WO-1003/.test(t) && !(await page.getByLabel(/^Overdue, /).first().isVisible().catch(() => false)), 'phone: a box opens its own page, the jobs in a table, no boxes');
  check(/Live Jobs › Quotation Required/.test(t), 'phone: the path shows Live Jobs › Quotation Required');
  await page.screenshot({path: 'shots/fin-box-phone.png'});
  await page.getByLabel('Box: Quotation Required').click(); await page.waitForTimeout(500);
  await page.locator('text=/^Awaiting Client Approval \\(1\\)$/ >> visible=true').last().click(); await page.waitForTimeout(1200);
  check(/box=awaiting_approval/.test(page.url()) && /WO-1006/.test(await text()), 'phone: the drop-down jumps to Awaiting Client Approval');
  await page.goBack(); await page.waitForTimeout(1500);
  check(await page.getByLabel(/^Overdue, /).count() === 1, 'phone: Back returns to the boxes');

  // ---- Phone: a job's money ----
  await page.goto(`${BASE}/fin/job/${S1}/repair/j3`); await page.waitForTimeout(6000);
  t = await text();
  check(/WORKS ORDER WO-1003/.test(t), 'the works order box: one heading, then the number');
  await page.getByLabel(/^Profit: /).click(); await page.waitForTimeout(800);
  t = await text();
  check(/Costs And Profit/.test(t) && /Materials/.test(t) && /Labour/.test(t) && /Plant/.test(t) && /Subcontract/.test(t) && /Margin/.test(t), 'Profit opens the costs broken down, profit and margin');
  await page.screenshot({path: 'shots/repair-costs-pop.png'});
  await page.getByText('Book A Cost To This Job ▾', {exact: true}).click(); await page.waitForTimeout(500);
  await menu('Skip hire · Biffa · £180.00').click(); await page.waitForTimeout(400);
  await menu('Book It').click(); await page.waitForTimeout(2000);
  check(db.fin_job_costs[0].sub_job_id === 'j3', 'Book A Cost To This Job: the skip is booked to WO-1003');
  await page.getByLabel('Close').last().click(); await page.waitForTimeout(400);
  await page.goto(`${BASE}/fin/job/${S1}/repair/j3`); await page.waitForTimeout(5000);
  check(/Costs: £180\.00/.test((await page.getByLabel(/^Costs: /).getAttribute('aria-label')) || ''), 'its costs now show £180');
  await page.getByLabel(/^Quoted: /).click(); await page.waitForTimeout(800);
  t = await text();
  check(/Quote/.test(t) && /Net/.test(t) && /Total/.test(t) && /Client’s Answer/.test(t) && await page.getByText('Open The Quote', {exact: true}).count() === 1, 'Quoted opens the quote: net, total, the client’s answer, Open The Quote');
  await page.getByLabel('Close').last().click(); await page.waitForTimeout(400);
  await page.getByLabel(/^Profit: /).click(); await page.waitForTimeout(800);
  await page.getByText('+ Add A Cost', {exact: true}).click(); await page.waitForTimeout(4500);
  await page.getByLabel('Description').fill('Scaffold tower'); await page.getByLabel('Net £').fill('95');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.fin_job_costs.some((c) => c.description === 'Scaffold tower' && c.sub_job_id === 'j3'), '+ Add A Cost: added and booked to the job');
  // Work Summary › ‹ Job Page
  await page.goto(`${BASE}/fin/job/${S1}/repair/j3`); await page.waitForTimeout(5000);
  await page.getByRole('tab', {name: /^Work Summary/}).click(); await page.waitForTimeout(700);
  check(await page.getByText('‹ Job Page', {exact: true}).count() === 1, 'Work Summary: ‹ Job Page beside Update');
  await page.getByText('‹ Job Page', {exact: true}).click(); await page.waitForTimeout(700);
  check(/WORKS ORDER/.test(await text()), '‹ Job Page goes back to the job');
  // Quote Update ▾ on an awaiting job: Rejected And Close Job
  await page.goto(`${BASE}/fin/job/${S1}/repair/j6`); await page.waitForTimeout(5000);
  check(await page.getByText('Quote Update ▾', {exact: true}).count() >= 1, 'Quote Update ▾ on a job awaiting approval');
  await page.getByText('Quote Update ▾', {exact: true}).last().click(); await page.waitForTimeout(500);
  t = await text();
  check(/Quote Approved/.test(t) && /Quote Rejected/.test(t) && /Rejected And Close Job/.test(t), 'Quote Update ▾: Approved, Rejected, Rejected And Close Job');
  await menu('Rejected And Close Job').click(); await page.waitForTimeout(500);
  await menu('Reject And Close').click(); await page.waitForTimeout(2000);
  const j6 = db.repair_jobs.find((j) => j.id === 'j6');
  check(j6.quote_approved === false && j6.closed === true && j6.job_status === 'Rejected', 'Rejected And Close Job: rejected and closed for good');
  // Attended By: the operative who uploaded the photos
  await page.goto(`${BASE}/sites/${S1}/repairs/job/j2`); await page.waitForTimeout(5000);
  await page.getByLabel(/^Attended: /).click(); await page.waitForTimeout(800);
  check(/Jake Morris/.test(await page.getByLabel('Attended By').innerText()), 'Update Status: Attended By is the operative who uploaded the photos');
  await page.getByText('Cancel', {exact: true}).last().click(); await page.waitForTimeout(400);
  // Costs By Job tab: Book A Cost To It
  db.fin_job_costs.push({id: 'c3', org_id: db.organizations[0].id, site_id: S1, category: 'other', cost_date: '2026-11-07', description: 'Fuel', supplier: 'Shell', net: 40, vat: 8, sub_job_id: null, split: null});
  await page.goto(`${BASE}/fin/job/${S1}/parts`); await page.waitForTimeout(6000);
  t = await text();
  check(/Costs By Job/.test(t) && /WO-1003/.test(t), 'Costs By Job: a tab, each job’s costs');
  await page.getByText(/^WO-1003/).first().click(); await page.waitForTimeout(600);
  check(/Book A Cost To It/.test(await text()), 'a job in Costs By Job: Book A Cost To It');
  await page.keyboard.press('Escape');

  // ---- Laptop: the same box page, wider table ----
  await page.setViewportSize({width: 1366, height: 900});
  await page.goto(`${BASE}/fin/job/${S1}/repairs?box=all`); await page.waitForTimeout(5000);
  t = await text();
  check(/WORKS ORDER/.test(t) && /STAGE/.test(t) && /OPERATIVE/.test(t) && /DUE/.test(t) && !(await page.getByLabel(/^Overdue, /).first().isVisible().catch(() => false)), 'laptop: a box’s own page too, the table with more columns');
  await page.screenshot({path: 'shots/fin-box-laptop.png'});
  await page.goto(`${BASE}/fin/job/${S1}/quote/j3`); await page.waitForTimeout(5000);
  const vq = await page.getByText('📄 View Quote', {exact: true}).boundingBox(), sv = await page.getByText('Save', {exact: true}).last().boundingBox();
  check(!!vq && !!sv && Math.abs(vq.y - sv.y) < 14 && vq.x < sv.x && /Awaiting Client Approval/.test(await text()), 'quote: View Quote on the left of Save and Send To Client, and what they do');
  await page.screenshot({path: 'shots/repair-quote-buttons.png'});
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
