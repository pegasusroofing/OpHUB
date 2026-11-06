// Finance tables (Andy, 6 Nov 2026): a date column's filter is a date filter: an exact day
// with a calendar, or a range (From / To calendars). Checked on Purchases › Approved. Fake database only.
// node datefilter-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  const now = new Date(), iso = (d) => d.toISOString().slice(0, 10);
  const thisMonth = iso(new Date(now.getFullYear(), now.getMonth(), 2, 12)), lastMonth = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15, 12));
  db.purchase_invoices.push({id: 'd1', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'THIS-1', invoice_date: thisMonth, net: 10, vat: 2, total: 12, status: 'approved', cost_code: 'materials'},
    {id: 'd2', org_id: O, site_id: S1, supplier_name: 'SIG', invoice_no: 'LAST-1', invoice_date: lastMonth, net: 20, vat: 4, total: 24, status: 'approved', cost_code: 'materials'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  await page.getByRole('tab', {name: /^Approved/}).click(); await page.waitForTimeout(800);
  const f = page.getByLabel('Filter Date', {exact: true});
  check(await f.count() === 1, 'the Date column has a date filter, not a typing box');
  await f.click(); await page.waitForTimeout(400);
  check(await page.getByText('Exact Date', {exact: true}).count() === 1 && await page.getByText('Range', {exact: true}).count() === 1 && await page.getByText('Last Month', {exact: true}).count() === 0, 'just two choices: Exact Date or Range');
  await page.getByText('Range', {exact: true}).click(); await page.waitForTimeout(300);
  check(await page.getByLabel('From', {exact: true}).count() >= 1 && await page.getByLabel('To', {exact: true}).count() >= 1, 'Range gives From and To calendars');
  await page.screenshot({path: 'shots/job/datefilter-1300.png'});
  await page.getByText('Clear', {exact: true}).click(); await page.waitForTimeout(300);
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
