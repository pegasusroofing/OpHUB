// Finance buttons in the tab row (Andy, 5 Nov 2026): Upload Statement, + Plant Hire, + Add A Price, Upload Price List,
// + New PO sit at the end of the Purchases row; + New PO opens the form straight away (project chosen on it). Fake database.
// node rowbtn-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  for (const [u, label, n] of [['/fin/statements', '⬆ Upload Statement', 'statements'], ['/fin/purchases?tab=plant', '+ Plant Hire', 'plant'], ['/fin/purchases?tab=pricebook', '+ Add A Price', 'pricebook'], ['/fin/purchases?tab=pricelists', '📥 Upload Price List', 'pricelists'], ['/fin/purchases?tab=orders', '+ New PO', 'orders']]) {
    await page.goto('http://localhost:8081' + u); await page.waitForTimeout(4000);
    const b = page.getByText(label, {exact: true}).first(), tab = page.getByRole('tab', {name: /^Purchase Orders/}).first();
    const bb = await b.boundingBox(), tb = await tab.boundingBox();
    check(!!bb && !!tb && Math.abs((bb.y + bb.height / 2) - (tb.y + tb.height / 2)) < 14, `${n}: ${label} sits in the tab row (${bb && Math.round(bb.y)} vs ${tb && Math.round(tb.y)})`);
    await page.screenshot({path: `shots/job/rowbtn-${n}.png`});
  }
  await page.getByText('+ New PO', {exact: true}).first().click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/fin/po/new' && await page.getByText('Choose the project', {exact: false}).count() >= 1, '+ New PO opens the form straight away, project chosen on it');
  await page.screenshot({path: 'shots/job/rowbtn-newpo.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
