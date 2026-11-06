// A purchase invoice checked line by line against its PO (Andy, 6 Nov 2026): pick the PO, the Against The PO card shows
// each line (matches / dearer / not on the PO), and a dearer line sends it to Needs Checking (query). Fake database only.
// node povs-check.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 1000}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_suppliers = [{id: 'fs1', org_id: org, name: 'Bauder'}];
  db.purchase_orders = [{id: 'po1', org_id: org, site_id: S1, number: 'J101-PO-014', supplier_name: 'Bauder', status: 'open', value: 2175.72, created_at: '2026-10-29T08:00:00Z', items: [{item: 'K4E capsheet 7.5m', qty: 24, rate: 77.805, amount: 1867.32}, {item: 'Type 3 trim GRP 3m', qty: 40, rate: 7.71, amount: 308.4}]}];
  db.purchase_invoices = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/pinv/new?site=' + S1); await page.waitForTimeout(5000);
  await page.getByLabel('Supplier', {exact: true}).last().click(); await page.waitForTimeout(400); await page.getByText('Bauder', {exact: true}).last().click();
  await page.getByLabel('Invoice number').fill('B-500');
  await page.getByLabel('Allocate To PO', {exact: true}).last().click(); await page.waitForTimeout(400); await page.getByText(/J101-PO-014/).last().click(); await page.waitForTimeout(500);
  await page.getByLabel('Line 1 description').fill('Bauder K4E capsheet 7.5m'); await page.getByLabel('Line 1 quantity').fill('24'); await page.getByLabel('Line 1 unit price').fill('80');
  await page.getByText('+ Add A Line', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 2 description').fill('Type 3 trim GRP'); await page.getByLabel('Line 2 quantity').fill('40'); await page.getByLabel('Line 2 unit price').fill('7.71');
  await page.getByText('+ Add A Line', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 3 description').fill('Pallet charge'); await page.getByLabel('Line 3 quantity').fill('1'); await page.getByLabel('Line 3 unit price').fill('25');
  await page.waitForTimeout(800);
  check(await page.getByText('Against J101-PO-014').count() === 1, 'the Against The PO card shows');
  check(await page.getByText(/Dearer than J101-PO-014: £80\.00 each, ordered at £77\.805/).count() === 1, 'line 1 dearer than the PO');
  check(await page.getByText('✓ Matches J101-PO-014').count() === 1, 'line 2 matches the PO');
  check(await page.getByText(/Not on J101-PO-014/).count() === 1, 'line 3 not on the PO');
  await page.getByText('Against J101-PO-014').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/job/povs-1300.png'});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(800);
  // Typed in by hand, Save would approve it; with warnings it asks first (6 Nov 2026).
  await page.getByText('Leave In Needs Checking', {exact: true}).click(); await page.waitForTimeout(3000);
  const p = db.purchase_invoices[0];
  check(p && p.status === 'query' && /isn’t on J101-PO-014|says £77\.805/.test(p.query_note || ''), 'saved as a query with the reasons: ' + (p && [p.status, p.query_note]));
  check(!errs.length, 'no errors ' + errs.slice(0, 2).join(' | '));
  await browser.close();
})();
