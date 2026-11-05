// Purchase invoices: the Unallocated / With A PM / To Approve ... choices as underlined tabs like the Finance
// tab row above, not chips (Andy, 5 Nov 2026). Laptop screenshot, fake database only.
// node pitabs-shots.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  const tabs = await page.getByRole('tab').allInnerTexts();
  console.log((tabs.some((t) => /All Filed/.test(t)) ? 'PASS' : 'FAIL') + ' tabs: ' + tabs.map((t) => t.replace(/\s+/g, ' ')).join(' | '));
  await page.getByRole('tab', {name: /All Filed/}).click(); await page.waitForTimeout(800);
  await page.screenshot({path: 'shots/job/pitabs-1300.png'});
  console.log('errors', errs.length ? errs.slice(0, 2).join(' | ') : 'none');
  await browser.close();
})();
