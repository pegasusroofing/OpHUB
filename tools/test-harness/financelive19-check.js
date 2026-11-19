// Finance trial or live, per company, set by the platform's super admin (Andy, 19 Nov 2026: "i want to make construction
// live. tell me how as super admin i can do that"). Platform Admin › the company › Finance: Trial / Live; going live
// asks first. (The database lets only the super admin change it: proved on the live database with a self-undoing test.)
// Fake database. node financelive19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'superadmin'; me.view_as_org_id = null;
  db.subscriptions = [];
  db.organizations.push({id: 'org-con', name: 'Construction Group Test', plan_tier: 'starter', has_pm: true, has_finance: true, finance_live: false, created_at: new Date().toISOString()});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.getByText('Create Company & Invite', {exact: true}).waitFor({timeout: 30000});
  await page.getByText('Construction Group Test', {exact: true}).last().click(); await page.waitForTimeout(1200);
  let t = await text();
  check(/Finance Trial Live/.test(t) && /Trial: Finance works, but nothing goes to Xero/.test(t), 'the company shows Finance: Trial / Live, on Trial');
  await page.getByText('Live', {exact: true}).last().click(); await page.waitForTimeout(800);
  t = await text();
  check(/Put Construction Group Test's Finance live\?/.test(t), 'going live asks first, saying what will happen');
  await page.screenshot({path: path.join(__dirname, 'shots', 'financelive19-ask.png')});
  await page.getByText('Yes, Go Live', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const o = db.organizations.find((x) => x.id === 'org-con');
  check(o.finance_live === true, `Yes: the company's Finance is live (${o.finance_live})`);
  t = await text();
  check(/Live: Xero posting, finance emails and the finance inbox all work/.test(t), 'the card says it is live');
  await page.screenshot({path: path.join(__dirname, 'shots', 'financelive19-live.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
