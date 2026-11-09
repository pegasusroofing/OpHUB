// Repairs, Andy 9 Nov 2026: Add Other Trade has a "Raise A Purchase Order" tick for anyone with Finance (in Projects too);
// saving opens Finalise The Purchase Order (supplier, what it's for, net, VAT, cost type, needed by); Raise PO numbers it
// (fin_new_po), books its cost to the works order (sub_job_id) and puts the PO on the trade, with a link to open it.
// A PM without Finance gets no tick. Laptop, fake database. node repair-trade-po-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const setup = (db, fin) => {
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  db.profiles[0].finance_enabled = !!fin; db.organizations[0].has_finance = true; // the seed turns Finance on for everyone
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  Object.assign(s, {repair_contract: true, name: 'Sovereign Repairs', client_name: 'Sovereign Housing'});
  db.repair_jobs = [{id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Approved - To Do', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, variation_issued_at: '2026-11-04T12:00:00Z', variation_cost: 300, quote_approved: true, created_at: '2026-11-03T09:00:00Z'}];
  db.repair_job_photos = []; db.repair_job_notes = []; db.purchase_orders = db.purchase_orders || [];
  return O;
};
const login = async (page) => {
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- An admin with Finance, in Projects ----
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  const O = setup(db, true);
  await ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
  await ctx.route('**/rest/v1/rpc/fin_new_po', async (r) => { const b = JSON.parse(r.request().postData() || '{}'); const id = 'po-new-1'; db.purchase_orders.push({id, org_id: O, site_id: b.p_site, number: 'J101-PO-001', supplier_id: b.p_supplier_id, supplier_name: b.p_supplier_name, items: b.p_items, required_by: b.p_required, fulfilment: b.p_delivery, note: b.p_note, value: b.p_items.reduce((t, x) => t + x.amount, 0), status: 'open', created_at: new Date().toISOString(), source: 'finance'}); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id, number: 'J101-PO-001'})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await login(page);
  await page.goto(`${BASE}/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
  await page.getByText('+ Add Other Trade', {exact: true}).click(); await page.waitForTimeout(600);
  check(await page.getByText('Raise A Purchase Order', {exact: true}).count() === 1, 'Add Other Trade: a Raise A Purchase Order tick (has Finance)');
  await page.getByLabel('Trade', {exact: true}).fill('Scaffold');
  await page.getByText('Raise A Purchase Order', {exact: true}).click(); await page.waitForTimeout(200);
  await page.screenshot({path: 'shots/repair-trade-po-tick.png'});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  let t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(/Finalise The Purchase Order/.test(t), 'saving opens Finalise The Purchase Order');
  check(await page.getByLabel('What It’s For').inputValue() === 'Scaffold — WO-1003 · 14 Elm Close', 'what it’s for: the trade, the works order and the address');
  check(/Plant/.test(await page.getByLabel('Cost Type').innerText()), 'a scaffold is booked as plant');
  const j3 = () => db.repair_jobs.find((j) => j.id === 'j3');
  check(Array.isArray(j3().trades) && j3().trades[0]?.trade === 'Scaffold', 'the trade is saved first');
  await page.getByText('Raise PO', {exact: true}).click(); await page.waitForTimeout(800);
  check(/Choose the supplier/.test(await page.locator('body').innerText()), 'it asks for the supplier');
  await page.getByLabel('Supplier', {exact: true}).click(); await page.waitForTimeout(400); await menu('SIG Roofing').click(); await page.waitForTimeout(300);
  await page.getByLabel('Net £').fill('450');
  await page.screenshot({path: 'shots/repair-trade-po-popup.png'});
  await page.getByText('Raise PO', {exact: true}).click(); await page.waitForTimeout(3000);
  const po = db.purchase_orders.find((p) => p.id === 'po-new-1');
  check(!!po && po.site_id === S1 && po.supplier_name === 'SIG Roofing' && po.value === 450 && po.vat === 90 && po.total === 540, `the PO: SIG Roofing, £450 + VAT £90 (${po ? [po.supplier_name, po.value, po.vat].join(' / ') : 'none'})`);
  check(!!po && po.sub_job_id === 'j3' && po.items[0].sub_job_id === 'j3' && po.items[0].cost_code === 'plant' && po.is_draft === false, 'booked to the works order, as plant, raised (not a draft)');
  check(j3().trades[0].po_number === 'J101-PO-001' && j3().trades[0].po_id === 'po-new-1', 'the PO is on the trade');
  t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(/PO J101-PO-001 ›/.test(t) && !/Finalise The Purchase Order/.test(t), 'the trade shows its PO; the pop-up closed');
  await page.screenshot({path: 'shots/repair-trade-po-done.png', fullPage: true});
  await page.getByText('+ Add Other Trade', {exact: true}).click(); await page.waitForTimeout(500);
  await page.getByText('Cancel', {exact: true}).last().click(); await page.waitForTimeout(300);
  await page.getByLabel('Scaffold, change').click(); await page.waitForTimeout(600);
  t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(await page.getByText('Raise A Purchase Order', {exact: true}).count() === 0 && /Purchase order J101-PO-001 is raised/.test(t), 'opening the trade again: no second PO, it says which PO');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(j3().trades[0].po_number === 'J101-PO-001', 'saving the trade again keeps its PO');
  await page.getByLabel('Purchase order J101-PO-001').click(); await page.waitForTimeout(2500);
  check(/\/fin\/po\/po-new-1/.test(page.url()), 'PO J101-PO-001 › opens the PO in Finance');
  await ctx.close();

  // ---- A PM without Finance: no tick ----
  const B = await makeContext(browser, 'pm', [], {viewport: {width: 1366, height: 900}});
  setup(B.db, false);
  await B.ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
  const pm = await B.ctx.newPage(); pm.on('pageerror', (e) => errs.push('pm: ' + e.message));
  await login(pm);
  await pm.goto(`${BASE}/sites/${S1}/repairs/job/j3`); await pm.waitForTimeout(5000);
  await pm.getByText('+ Add Other Trade', {exact: true}).click(); await pm.waitForTimeout(600);
  check(await pm.getByLabel('Trade', {exact: true}).count() === 1 && await pm.getByText('Raise A Purchase Order', {exact: true}).count() === 0, 'a PM without Finance: no PO tick');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
