// Every Finance tab row as underlined tabs (Andy, 5 Nov 2026): a project's Purchases, Variations, Summary, and the
// Finance Purchases page. Laptop screenshots, fake database only.
// node fintabs-shots.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const S1 = '11111111-1111-1111-1111-111111111111';
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  for (const [u, n] of [[`/fin/job/${S1}?tab=purchases`, 'job-purchases'], [`/fin/job/${S1}/variations`, 'job-variations'], [`/fin/job/${S1}/summary`, 'job-summary'], ['/fin/purchases?tab=orders', 'purchase-orders'], ['/fin/purchases?tab=pricebook', 'price-book'], ['/fin/sales?tab=invoices', 'sales']]) {
    await page.goto('http://localhost:8081' + u); await page.waitForTimeout(5000);
    const tabs = await page.getByRole('tab').allInnerTexts();
    console.log(n, '|', tabs.map((t) => t.replace(/\s+/g, ' ')).join(' · '));
    await page.screenshot({path: `shots/job/fintabs-${n}.png`});
  }
  console.log('errors', errs.length ? errs.slice(0, 2).join(' | ') : 'none');
  await browser.close();
})();
