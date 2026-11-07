// Repair contracts, rebuilt (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md), on a phone, fake database:
// manager — four tiles, Works Orders boxes, a job's hub and repair page, a quote from the schedule of rates (less the
// discount, VAT once at the bottom), client approval, notes; operative — their jobs by day, check in, the steps (fault,
// repair, photos, completed in the visit? no → to price; a works visit → works done), check out; Finance — Works Orders
// list and Invoice Done Jobs; client — the hub without money or updates, with the documents. node repairs-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const setup = (db, opId) => {
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  s.repair_contract = true; s.repair_discount_pct = 10; s.name = 'Sovereign Repairs';
  db.repair_jobs = [
    {id: 'j1', org_id: O, site_id: S1, job_number: 'WO-1001', address: 'Flat 4, Oak House', description: 'Gutter overflowing', job_status: 'To Survey', survey_required: 'N', created_at: '2026-11-06T09:00:00Z'},
    {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', tenant_name: 'Mr K Hughes', tenant_phone: '07700 900456', job_status: 'To Survey', survey_required: 'N', survey_booking_date: day(0), survey_booking_assigned_to: opId, created_at: '2026-11-05T09:00:00Z'},
    {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, fault_description: 'Slipped tiles at the chimney', repair_description: 'Refix 4 tiles, new lead flashing', created_at: '2026-11-03T09:00:00Z'},
    {id: 'j4', org_id: O, site_id: S1, job_number: 'WO-1004', address: '9 Park Road', description: 'Ridge tile loose', job_status: 'Closed', survey_required: 'Y', survey_date: '2026-11-01T10:00:00Z', completed_in_visit: true, works_completed: true, works_completed_date: '2026-11-01T14:00:00Z', closed: true, variation_cost: 460, created_at: '2026-10-30T09:00:00Z'},
    {id: 'j5', org_id: O, site_id: S1, job_number: 'WO-1005', address: '8 Station Rd', description: 'Missing ridge tiles', job_status: 'Approved - To Do', survey_required: 'Y', survey_date: '2026-11-02T10:00:00Z', completed_in_visit: false, variation_issued_at: '2026-11-02T12:00:00Z', variation_cost: 300, quote_approved: true, works_booking_date: day(1), works_booking_assigned_to: opId, created_at: '2026-10-29T09:00:00Z'},
  ];
  db.repair_job_photos = [{id: 'ph2', repair_job_id: 'j2', category: 'survey', storage_path: 'x/p2.jpg', deleted_at: null}, {id: 'ph5', repair_job_id: 'j5', category: 'completion', storage_path: 'x/p5.jpg', deleted_at: null}];
  db.repair_job_notes = []; db.repair_rates = [
    {id: 'r1', org_id: O, site_id: S1, code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45, sort: 0},
    {id: 'r2', org_id: O, site_id: S1, code: 'RF205', description: 'Clear gutters', unit: 'm', rate: 3.5, sort: 1}];
  db.checkins = db.checkins || [];
};
const login = async (page) => {
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const stubs = async (ctx) => {
  await ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
  await ctx.route('**/api.postcodes.io/**', (r) => r.abort());
};
(async () => {
  const browser = await chromium.launch(); const errs = [];

  // ---------- Manager ----------
  const A = await makeContext(browser, 'admin', [], {shot: true}); setup(A.db, 'o1'); await stubs(A.ctx);
  const page = await A.ctx.newPage(); page.on('pageerror', (e) => errs.push('mgr: ' + e.message)); page.on('dialog', (d) => d.accept());
  await login(page);
  await page.goto(`http://localhost:8081/sites/${S1}`); await page.waitForTimeout(5000);
  let t = await page.locator('body').innerText();
  check(/Works Orders/.test(t) && /Health & Safety/.test(t) && /Calendar/.test(t) && /To Do List/.test(t) && !/Materials/.test(t), 'home: four tiles — Works Orders, Health & Safety, Calendar, To Do List');
  await page.screenshot({path: 'shots/repair-home.png'});
  await page.goto(`http://localhost:8081/sites/${S1}/repairs`); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  check(/To Book/.test(t) && /Quote Needed/.test(t) && /Awaiting Approval/.test(t) && /On Hold \/ Other Trades/.test(t), 'Works Orders: the stage boxes');
  check(/WO-1001 · Flat 4, Oak House/.test(t), 'To Book lists WO-1001');
  await page.getByText('+ New Job (Read Works Order)', {exact: true}).click(); await page.waitForTimeout(500);
  check(await page.getByPlaceholder('Tenant', {exact: true}).count() === 1 && await page.getByPlaceholder('Tenant No.').count() === 1, '+ New Job has the tenant fields');
  await page.screenshot({path: 'shots/repair-worksorders.png'});
  await page.getByText('Cancel', {exact: true}).last().click();

  // A job needing a quote: hub, repair page, the quote.
  await page.goto(`http://localhost:8081/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  check(/Quote Needed/.test(t) && /price it from the attendance report/i.test(t), 'hub: the stage and what’s next');
  check(/Call-Out/.test(t) && /Tenant/.test(t) && /Booked For/.test(t) && /Attended/.test(t) && /Completed/.test(t), 'hub: details and the three dates');
  check(!/MONEY/.test(t), 'Projects: no money box');
  await page.screenshot({path: 'shots/repair-hub.png', fullPage: true});
  await page.getByRole('tab', {name: /^Repair/}).click(); await page.waitForTimeout(600);
  t = await page.locator('body').innerText();
  check(/Booked In/.test(t) && /Slipped tiles at the chimney/.test(t) && /Refix 4 tiles/.test(t) && /Works Done/.test(t), 'repair page: each stage, with the fault and repair');
  await page.screenshot({path: 'shots/repair-page.png', fullPage: true});
  await page.goto(`http://localhost:8081/sites/${S1}/repairs/quote/j3`); await page.waitForTimeout(5000);
  await page.getByLabel('Search the schedule of rates').fill('tile'); await page.waitForTimeout(400);
  await page.getByLabel(/^Add RF101/).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 1 quantity').fill('4');
  await page.getByText('+ Add Your Own Line', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 2 description').fill('New lead flashing');
  await page.getByLabel('Line 2 rate').fill('120'); await page.waitForTimeout(300);
  t = await page.locator('body').innerText();
  // 4 × £45 = £180 less 10% = £162; + £120 = £282 net; VAT 20% £56.40; total £338.40
  check(/£162\.00/.test(t) && /£282\.00/.test(t) && /£56\.40/.test(t) && /£338\.40/.test(t), 'quote: schedule of rates less 10%, own line in full, VAT once (£338.40)');
  await page.screenshot({path: 'shots/repair-quote.png', fullPage: true});
  await page.getByText('Save & Send To Client', {exact: true}).click(); await page.waitForTimeout(3000);
  const j3 = A.db.repair_jobs.find((j) => j.id === 'j3');
  check(Number(j3.variation_cost) === 282 && !!j3.variation_issued_at && j3.job_status === 'Surveyed - Variation Issued' && Array.isArray(j3.quote_lines) && j3.quote_lines.length === 2, 'sent: net £282 saved, awaiting approval (old status kept in step)');
  await page.goto(`http://localhost:8081/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
  check(/Awaiting Approval/.test(await page.locator('body').innerText()), 'the hub now says Awaiting Approval');
  await page.getByText('Update ▾', {exact: true}).click(); await page.waitForTimeout(600);
  await page.locator('text="Client Approved" >> visible=true').last().click(); await page.waitForTimeout(600);
  const yes = page.locator('text="Yes, Approved" >> visible=true'); if (await yes.count()) await yes.last().click();
  await page.waitForTimeout(2500);
  check(j3.quote_approved === true && j3.job_status === 'Approved - To Do', 'Client Approved: approved, ready to book the works');
  await page.getByLabel('Add a note').fill('Tenant prefers mornings'); await page.getByText('Add', {exact: true}).click(); await page.waitForTimeout(1500);
  check(A.db.repair_job_notes.some((n) => n.repair_job_id === 'j3' && /mornings/.test(n.body)), 'a note is added');

  // ---------- Operative ----------
  const B = await makeContext(browser, 'operative', [], {shot: true}); setup(B.db, 'me'); await stubs(B.ctx);
  await B.ctx.grantPermissions(['geolocation']); await B.ctx.setGeolocation({latitude: 52.06, longitude: -1.34});
  const op = await B.ctx.newPage(); op.on('pageerror', (e) => errs.push('op: ' + e.message)); op.on('dialog', (d) => d.accept());
  await login(op);
  await op.goto(`http://localhost:8081/sites/${S1}/repairs`); await op.waitForTimeout(5000);
  t = await op.locator('body').innerText();
  check(/My Jobs \(2\)/.test(t) && /Show All/.test(t) && /TODAY/.test(t) && /TOMORROW/.test(t), 'operative: my jobs by day (Today, Tomorrow) with Show All');
  check(t.indexOf('WO-1002') < t.indexOf('WO-1005') && !/WO-1001/.test(t), 'soonest first; other people’s / unbooked jobs not in My Jobs');
  await op.screenshot({path: 'shots/repair-operative-list.png'});
  await op.goto(`http://localhost:8081/sites/${S1}/repairs/job/j2`); await op.waitForTimeout(5000);
  check(/Check In To Start/.test(await op.locator('body').innerText()), 'opening a job: check in first');
  await op.getByRole('button', {name: 'Check In', exact: true}).first().click(); await op.waitForTimeout(3000);
  check(B.db.checkins.some((c) => c.repair_job_id === 'j2' && c.type === 'in'), 'checked in to the job (with the job on the row)');
  await op.getByLabel('What’s wrong, what you found').fill('Split joint in the porch felt'); await op.getByText('Save', {exact: true}).first().click(); await op.waitForTimeout(1200);
  await op.getByLabel('What needs doing to fix it').fill('Cut out and patch, new flashing'); await op.getByText('Save', {exact: true}).first().click(); await op.waitForTimeout(1200);
  await op.screenshot({path: 'shots/repair-operative-steps.png', fullPage: true});
  await op.getByText('No — Needs A Quote', {exact: true}).click(); await op.waitForTimeout(2500);
  const j2 = B.db.repair_jobs.find((j) => j.id === 'j2');
  check(j2.completed_in_visit === false && j2.survey_required === 'Y' && j2.job_status === 'Surveyed - Awaiting Cost' && /porch felt/.test(j2.fault_description), 'not done in the visit: attended, to the office to price');
  await op.getByText('Check Out', {exact: true}).last().click(); await op.waitForTimeout(3000);
  check(B.db.checkins.some((c) => c.repair_job_id === 'j2' && c.type === 'out'), 'checked out');
  await op.goto(`http://localhost:8081/sites/${S1}/repairs/job/j5`); await op.waitForTimeout(5000);
  await op.getByRole('button', {name: 'Check In', exact: true}).first().click(); await op.waitForTimeout(3000);
  t = await op.locator('body').innerText();
  check(/Works visit/.test(t) && /Completion Photos And Works Completed/.test(t) && !/Description Of Fault/.test(t), 'a works visit goes straight to the completion step');
  await op.getByLabel('Description of the works completed').fill('Rebedded ridge, all sound'); await op.getByText('Mark Works Done', {exact: true}).click(); await op.waitForTimeout(3000);
  const j5 = B.db.repair_jobs.find((j) => j.id === 'j5');
  check(j5.works_completed === true && j5.job_status === 'Awaiting Sign-off', 'works done');

  // ---------- Finance ----------
  A.db.profiles[0].finance_enabled = true;
  await page.goto(`http://localhost:8081/fin/job/${S1}/repairs`); await page.waitForTimeout(6000);
  t = await page.locator('body').innerText();
  check(/WO-1004/.test(t) && /Invoice Done Jobs \(1\)/.test(t), 'Finance: Works Orders list, one checked job to invoice');
  await page.screenshot({path: 'shots/repair-finance.png', fullPage: true});
  await page.getByText('Invoice Done Jobs (1)', {exact: true}).click(); await page.waitForTimeout(800);
  const y2 = page.locator('text="Yes, Invoice Them" >> visible=true'); if (await y2.count()) await y2.last().click();
  await page.waitForTimeout(5000);
  const j4 = A.db.repair_jobs.find((j) => j.id === 'j4'), inv = (A.db.fin_invoices || []).find((i) => i.id === j4.invoice_id);
  check(!!inv && inv.status === 'draft' && (inv.lines || []).some((l) => /WO-1004 — 9 Park Road/.test(l.description) && Number(l.amount) === 460), 'Invoice Done Jobs: a draft invoice with the job’s line at £460');
  await page.goto(`http://localhost:8081/fin/job/${S1}/repair/j4`); await page.waitForTimeout(6000);
  t = await page.locator('body').innerText();
  check(/MONEY/.test(t) && /Quoted/.test(t) && /Open Invoice/.test(t), 'Finance hub: the money box and the invoice');

  // ---------- Client ----------
  const C = await makeContext(browser, 'client', [], {shot: true}); setup(C.db, 'o1'); await stubs(C.ctx);
  const cl = await C.ctx.newPage(); cl.on('pageerror', (e) => errs.push('client: ' + e.message));
  await login(cl);
  await cl.goto(`http://localhost:8081/sites/${S1}/repairs/job/j3`); await cl.waitForTimeout(5000);
  t = await cl.locator('body').innerText();
  check(!/Update ▾/.test(t) && !/MONEY/.test(t) && !/Repair Page/.test(t), 'client: no updates, no money');
  check(/Attendance Report/.test(t) && /NOTES/.test(t), 'client: the documents and the notes');
  await cl.screenshot({path: 'shots/repair-client.png', fullPage: true});

  check(!errs.length, `no errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
