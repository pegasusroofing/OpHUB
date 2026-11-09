// Repairs, Andy 9 Nov 2026: a PM quotes from the job in Projects, the same as every other step, with or without Finance.
// A PM without Finance: Price It on the Quote step and in Update ▾, the quote opens at /sites/…/repairs/quote/… (not
// Finance), Save puts the job in Awaiting Client Approval with its total on the Quote step, Send To Client sends it.
// An operative gets no Price It. Finance's own quote address still works. Laptop, fake database. node repair-quote-pm-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const fns = []; let DB = null;
// As the server does: a quote emailed is marked sent to whom.
global.__fn = (name, b) => { fns.push([name, b]); if (name === 'send-repair-quote' && Array.isArray(b.recipients) && DB) Object.assign(DB.repair_jobs.find((j) => j.id === b.repair_job_id) || {}, {quote_sent_to: b.recipients.join(', ')}); return {ok: true}; };
const setup = (db, fin) => {
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  db.profiles[0].finance_enabled = !!fin; db.organizations[0].has_finance = true;
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  Object.assign(s, {repair_contract: true, name: 'Sovereign Repairs', client_name: 'Sovereign Housing', client_email: 'repairs@sovereign.example', repair_discount_pct: 10});
  db.repair_jobs = [{id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, fault_description: 'Slipped tiles', repair_description: 'Refix 4 tiles', created_at: '2026-11-03T09:00:00Z'}];
  db.repair_job_photos = []; db.repair_job_notes = [];
  db.repair_rates = [{id: 'r1', org_id: O, site_id: S1, code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45, sort: 0, category: 'Pitched Roofing', section: 'Plain Tiles'}];
};
const login = async (page) => {
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const stubs = async (ctx) => ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- A PM without Finance, in Projects ----
  const {ctx, db} = await makeContext(browser, 'pm', [], {viewport: {width: 1366, height: 900}});
  setup(db, false); await stubs(ctx); DB = db;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => d.accept());
  await login(page);
  await page.goto(`${BASE}/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
  let t = await page.locator('body').innerText();
  check(/Next: price it/.test(t) && !/With Finance to price/.test(t), 'a PM without Finance: the next step is to price it (not "with Finance")');
  check(await page.getByText('Price It', {exact: true}).count() === 1, 'the Quote step has Price It, as the other steps have their buttons');
  await page.getByText('Update ▾', {exact: true}).click(); await page.waitForTimeout(500);
  check(await page.locator('text="Price It (Quote)" >> visible=true').count() > 0, 'Update ▾ offers Price It (Quote)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const x = page.getByLabel('Close', {exact: true}); if (await x.count()) { await x.last().click(); await page.waitForTimeout(300); }
  await page.getByText('Price It', {exact: true}).click(); await page.waitForTimeout(4000);
  check(new URL(page.url()).pathname === `/sites/${S1}/repairs/quote/j3`, `the quote opens in Projects, not Finance (${new URL(page.url()).pathname})`);
  t = await page.locator('body').innerText();
  check(/From The Schedule Of Rates/.test(t) && await page.getByLabel('Search the schedule of rates').count() >= 1, 'the quote screen: the schedule of rates to pick from');
  await page.getByLabel('Search the schedule of rates').fill('tile'); await page.waitForTimeout(400);
  await page.getByLabel(/^Add RF101/).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 1 quantity').fill('4'); await page.waitForTimeout(300);
  t = await page.locator('body').innerText();
  check(/£162\.00/.test(t), 'a line from the rates: 4 × £45 less 10% = £162.00');
  await page.screenshot({path: 'shots/repair-quote-pm.png', fullPage: true});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const j3 = () => db.repair_jobs.find((j) => j.id === 'j3');
  check(Array.isArray(j3().quote_lines) && j3().quote_lines.length === 1 && Number(j3().variation_cost) === 162 && !!j3().variation_issued_at, 'Save: the quote is on the job, £162 net, Awaiting Approval');
  check(new URL(page.url()).pathname === `/sites/${S1}/repairs/job/j3`, 'Save goes back to the job in Projects');
  await page.waitForTimeout(1500);
  t = await page.locator('body').innerText();
  check(/£194\.40 · not sent/.test(t) && /Open The Quote/.test(t), 'the Quote step: the total with VAT (£194.40), not sent, and Open The Quote');
  // On the Quote line (Andy, 9 Nov 2026): Send To Client while it hasn't been sent, and Quote Update ▾ for the answer.
  const oq = await page.getByText('Open The Quote', {exact: true}).boundingBox(), sc = await page.getByText('Send To Client', {exact: true}).boundingBox(), qu = await page.getByText('Quote Update ▾', {exact: true}).first().boundingBox();
  check(!!oq && !!sc && Math.abs(oq.y - sc.y) < 6 && sc.x > oq.x, 'Send To Client sits next to Open The Quote');
  check(!!qu && !!oq && Math.abs(qu.y - oq.y) < 40, 'Quote Update ▾ is on the Quote line too');
  await page.screenshot({path: 'shots/repair-quote-pm-job.png', fullPage: true});
  await page.getByText('Send To Client', {exact: true}).click(); await page.waitForTimeout(800);
  check(await page.getByLabel('To', {exact: true}).inputValue() === 'repairs@sovereign.example', 'Send To Client: the client’s email filled in (no Finance bill-to needed)');
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(4000);
  // The test company counts as RTB, so the Finance trial holds the email back (as it does for RTB's real jobs now).
  check(/Finance is in trial/.test(await page.locator('body').innerText()) && !fns.some(([n, b]) => n === 'send-repair-quote' && Array.isArray(b.recipients)), 'Send To Client from the job: saved, the email held back by the Finance trial');
  const ok2 = page.locator('text="OK" >> visible=true'); if (await ok2.count()) await ok2.last().click();
  j3().quote_sent_to = 'repairs@sovereign.example'; // as the server marks it once it has really gone
  await page.reload(); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  check(await page.getByText('Send To Client', {exact: true}).count() === 0 && /sent to repairs@sovereign\.example/.test(t), 'once sent: no Send To Client, it says who it went to');
  await page.getByText('Quote Update ▾', {exact: true}).first().click(); await page.waitForTimeout(500);
  await page.locator('text="Quote Approved" >> visible=true').last().click(); await page.waitForTimeout(2000);
  check(j3().quote_approved === true && j3().job_status === 'Approved - To Do', 'Quote Update ▾ on the Quote line › Quote Approved');
  await ctx.close();

  // ---- A company without OpHUB Finance: the PM types in the quote figure; nothing is sent from OpHUB ----
  {
    const N = await makeContext(browser, 'pm', [], {viewport: {width: 1366, height: 900}});
    setup(N.db, false); N.db.organizations[0].has_finance = false; await stubs(N.ctx);
    const np = await N.ctx.newPage(); np.on('pageerror', (e) => errs.push('no-fin co: ' + e.message));
    await login(np);
    await np.goto(`${BASE}/sites/${S1}/repairs/job/j3`); await np.waitForTimeout(5000);
    let nt = await np.locator('body').innerText();
    check(await np.getByText('Enter Quote Figure', {exact: true}).count() === 1 && await np.getByText('Price It', {exact: true}).count() === 0 && /enter the quote figure here/.test(nt), 'no Finance company: Enter Quote Figure on the Quote line (no quote screen)');
    await np.getByText('Enter Quote Figure', {exact: true}).click(); await np.waitForTimeout(800);
    check(/Enter The Quote Figure/.test(await np.locator('body').innerText()) && new URL(np.url()).pathname === `/sites/${S1}/repairs/job/j3`, 'it opens a pop-up on the job, not the quote screen');
    await np.getByLabel('Quote Figure £ (Excl. VAT)').fill('450');
    await np.screenshot({path: 'shots/repair-quote-figure.png'});
    await np.getByText('Save', {exact: true}).last().click(); await np.waitForTimeout(2500);
    const nj = N.db.repair_jobs.find((j) => j.id === 'j3');
    check(Number(nj.variation_cost) === 450 && !!nj.variation_issued_at && nj.job_status === 'Surveyed - Variation Issued' && nj.quote_lines?.length === 1, 'Save: £450 on the job, Awaiting Client Approval');
    nt = await np.locator('body').innerText();
    check(/£540\.00 · sent /.test(nt) && await np.getByText('Send To Client', {exact: true}).count() === 0 && await np.getByText('Change Quote Figure', {exact: true}).count() === 1 && await np.getByText('Quote Update ▾', {exact: true}).count() >= 1, 'the Quote line: £540.00 with VAT, sent; Change Quote Figure and Quote Update ▾, no Send To Client');
    await np.screenshot({path: 'shots/repair-quote-figure-job.png', fullPage: true});
    await N.ctx.close();
  }

  // ---- An operative: no Price It ----
  const O = await makeContext(browser, 'operative', [], {viewport: {width: 1366, height: 900}});
  setup(O.db, false); O.db.repair_jobs[0].survey_booking_assigned_to = O.db.profiles[0].id; await stubs(O.ctx);
  const op = await O.ctx.newPage(); op.on('pageerror', (e) => errs.push('op: ' + e.message));
  await login(op);
  await op.goto(`${BASE}/sites/${S1}/repairs/job/j3`); await op.waitForTimeout(5000);
  check(await op.getByText('Price It', {exact: true}).count() === 0 && !/£/.test(await op.locator('body').innerText()), 'an operative: no Price It, no money');
  await O.ctx.close();

  // ---- Finance's own quote address still works ----
  const F = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  setup(F.db, true); await stubs(F.ctx);
  const fp = await F.ctx.newPage(); fp.on('pageerror', (e) => errs.push('fin: ' + e.message));
  await login(fp);
  await fp.goto(`${BASE}/fin/job/${S1}/quote/j3`); await fp.waitForTimeout(5000);
  check(/From The Schedule Of Rates/.test(await fp.locator('body').innerText()), 'Finance: /fin/job/…/quote/… opens the same quote screen');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
