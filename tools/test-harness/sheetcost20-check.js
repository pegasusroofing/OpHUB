// A labour price sheet's Finance order is a guide, not a commitment (Andy, 20 Nov 2026: "The price sheet doesn't commit as
// labour cost (it's a guide) only operative invoices do"). A job with a price-sheet order (£5,000) and an ordinary
// subcontract order (£3,000): the job's costs count only the £3,000 as ordered, not invoiced. Fake database.
// node sheetcost20-check.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.job_finance = [{site_id: S1, org_id: org, billing_type: 'invoice', contract_value: 20000}];
  db.fin_subcontracts = [
    {id: 'sc1', org_id: org, site_id: S1, seq: 1, number: 'SC-001', name: 'Sheet Gang', order_value: 5000, status: 'open', price_sheet_id: 'ps1', source: 'price_sheet', created_at: '2026-11-20T09:00:00Z'},
    {id: 'sc2', org_id: org, site_id: S1, seq: 2, number: 'SC-002', name: 'Acme Scaffolding', order_value: 3000, status: 'open', price_sheet_id: null, source: null, created_at: '2026-11-20T09:00:00Z'},
  ];
  db.fin_sub_apps = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/' + S1 + '/costs'); await page.waitForTimeout(6000);
  // The Type filter lists "Ordered, not invoiced £…" with what's committed.
  await page.getByRole('button', {name: 'Filter', exact: true}).first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', {name: 'Type', exact: true}).first().click(); await page.waitForTimeout(800);
  const t = await page.locator('body').innerText();
  const ordered = (t.match(/Ordered, not invoiced £[\d,]+/) || [''])[0];
  check(ordered === 'Ordered, not invoiced £3,000', `only the ordinary subcontract order is committed, not the price sheet's (${ordered || 'not found'})`);
  await page.locator('text=/^Ordered, not invoiced/ >> visible=true').first().click(); await page.waitForTimeout(800);
  const t2 = await page.locator('body').innerText();
  check(/Acme Scaffolding/.test(t2) && !/Sheet Gang/.test(t2), 'the ordered list shows the scaffolders, not the price sheet gang');
  await page.screenshot({path: 'shots/sheetcost20.png'});
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0, 300)}`);
  await browser.close();
})();
