// Laptop screenshots of Works Orders (Projects) and Live Jobs (Finance), with the same set-up as repairs-check.js.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const setup = (db, opId) => {
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  s.repair_contract = true; s.repair_discount_pct = 10; s.name = 'Sovereign Repairs'; s.client_name = 'Sovereign Housing';
  // Set up in Projects: no billing type or bill-to in Finance yet (the client comes from the project).
  Object.assign(db.job_finance.find((x) => x.site_id === S1) || {}, {billing_type: null, billing_name: null, billing_email: null});
  db.repair_jobs = [
    {id: 'j1', org_id: O, site_id: S1, job_number: 'WO-1001', address: 'Flat 4, Oak House', description: 'Gutter overflowing', job_status: 'To Survey', survey_required: 'N', created_at: '2026-11-06T09:00:00Z'},
    {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', tenant_name: 'Mr K Hughes', tenant_phone: '07700 900456', job_status: 'To Survey', survey_required: 'N', survey_booking_date: day(0), survey_booking_assigned_to: opId, created_at: '2026-11-05T09:00:00Z'},
    {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, fault_description: 'Slipped tiles at the chimney', repair_description: 'Refix 4 tiles, new lead flashing', created_at: '2026-11-03T09:00:00Z'},
    {id: 'j4', org_id: O, site_id: S1, job_number: 'WO-1004', address: '9 Park Road', description: 'Ridge tile loose', job_status: 'Closed', survey_required: 'Y', survey_date: '2026-11-01T10:00:00Z', completed_in_visit: true, works_completed: true, works_completed_date: '2026-11-01T14:00:00Z', closed: true, variation_cost: 460, created_at: '2026-10-30T09:00:00Z'},
    {id: 'j5', org_id: O, site_id: S1, job_number: 'WO-1005', address: '8 Station Rd', description: 'Missing ridge tiles', job_status: 'Approved - To Do', survey_required: 'Y', survey_date: '2026-11-02T10:00:00Z', completed_in_visit: false, variation_issued_at: '2026-11-02T12:00:00Z', variation_cost: 300, quote_approved: true, works_booking_date: day(1), works_booking_assigned_to: opId, created_at: '2026-11-01T09:00:00Z'},
  ];
  db.repair_job_photos = [{id: 'ph2', repair_job_id: 'j2', category: 'survey', storage_path: 'x/p2.jpg', deleted_at: null}, {id: 'ph5', repair_job_id: 'j5', category: 'completion', storage_path: 'x/p5.jpg', deleted_at: null}];
  db.repair_job_notes = []; db.repair_rates = [
    {id: 'r1', org_id: O, site_id: S1, code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45, sort: 0, category: 'Pitched Roofing', section: 'Plain Tiles'},
    {id: 'r2', org_id: O, site_id: S1, code: 'RF205', description: 'Clear gutters', unit: 'm', rate: 3.5, sort: 1, category: 'Fascia, Soffit, Gutters', section: 'Gutters'}];
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
const fns = [];
global.__fn = (name, b) => { fns.push([name, b]); return name === 'onedrive-repair-folder' ? {error: 'no_site_folder'} : {ok: true}; };
(async () => {
  const browser = await chromium.launch();
  const A = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 860}}); setup(A.db, 'o1'); await stubs(A.ctx);
  const page = await A.ctx.newPage(); await login(page);
  await page.goto('http://localhost:8081/sites/' + S1 + '/repairs'); await page.waitForTimeout(6000);
  await page.screenshot({path: 'shots/repair-worksorders-laptop.png'});
  await page.getByLabel(/^Quotation Required, /).click(); await page.waitForTimeout(800);
  const tile = await page.getByLabel(/^Quotation Required, /).boundingBox(), row = await page.getByText(/WO-1003/).first().boundingBox();
  check(!!tile && !!row && row.x > tile.x + tile.width, 'laptop: a box open puts the boxes down the left, its jobs on the right');
  await page.screenshot({path: 'shots/repair-worksorders-laptop-open.png'});
  A.db.profiles[0].finance_enabled = true;
  await page.goto('http://localhost:8081/fin/job/' + S1 + '/repairs'); await page.waitForTimeout(6000);
  await page.screenshot({path: 'shots/repair-finance-livejobs-laptop.png'});
  await browser.close();
})();
