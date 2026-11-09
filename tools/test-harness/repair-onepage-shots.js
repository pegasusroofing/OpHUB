// Screenshots for Andy (9 Nov 2026), phone and laptop, fake database: a repair contract's home (Works Orders full width,
// Calendar and To Do List, Health & Safety below) and a job's one page (the details, then the Work Summary).
// node repair-onepage-shots.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const BASE = 'http://localhost:8081';
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [['phone', {width: 390, height: 844}], ['laptop', {width: 1366, height: 900}]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: vp});
    seed(db); db.profiles[0].howto_dismissed = ['*'];
    const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
    Object.assign(s, {repair_contract: true, name: 'Sovereign Repairs', client_name: 'Sovereign Housing', client_contact_name: 'Jo Bloggs'});
    const op = db.profiles.find((p) => p.role === 'operative');
    db.repair_jobs = [
      {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', tenant_name: 'Mr K Hughes', tenant_phone: '07700 900456', job_status: 'To Survey', survey_required: 'N', survey_booking_date: day(1), survey_booking_slot: 'AM (8am – 12pm)', survey_booking_notes: 'Key safe 1234', survey_booking_assigned_to: op ? op.id : null, work_order_path: 'x/wo.pdf', work_order_name: 'WO-1002.pdf', created_at: '2026-11-05T09:00:00Z'},
      {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', tenant_name: 'Mrs A Patel', tenant_phone: '07700 900123', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, fault_description: 'Slipped tiles', repair_description: 'Refix 4 tiles', created_at: '2026-11-03T09:00:00Z'},
    ];
    db.repair_job_photos = []; db.repair_job_notes = []; db.site_calendar_events = db.site_calendar_events || [];
    await ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
    const page = await ctx.newPage();
    await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${BASE}/sites/${S1}`); await page.waitForTimeout(5000);
    await page.screenshot({path: `shots/repair-home-${name}.png`});
    await page.goto(`${BASE}/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
    await page.screenshot({path: `shots/repair-job-onepage-${name}.png`, fullPage: true});
    console.log('shots', name);
    await ctx.close();
  }
  await browser.close();
})();
