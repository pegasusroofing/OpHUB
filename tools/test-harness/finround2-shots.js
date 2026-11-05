// Laptop screenshots of the Finance pages changed in the overnight round 2 (5 Nov 2026), fake database only.
// node finround2-shots.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path'), fs = require('fs');
const B = 'http://localhost:8081';
const OUT = path.join(__dirname, 'shots', 'cmp', 'fin', 'round2'); fs.mkdirSync(OUT, {recursive: true});
const PAGES = [['budget', `/fin/job/${S1}/budget`], ['costs', `/fin/job/${S1}/costs`], ['yard', '/fin/yard'], ['subpos', '/fin/subs?tab=orders'], ['overview', `/fin/job/${S1}`], ['jobpurchases', `/fin/job/${S1}?tab=purchases`], ['retention', '/fin/sales?tab=retention']];
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 1000}});
  require('./seeds/fincmp')(db, S1); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*']; me.finance_enabled = true;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  for (const [n, u] of PAGES) {
    await page.goto(B + u); await page.waitForTimeout(4500);
    await page.screenshot({path: path.join(OUT, n + '.png')});
    const t = await page.evaluate(() => document.body.innerText);
    console.log(n, '|', t.replace(/\s+/g, ' ').slice(0, 160));
  }
  console.log('errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
  await browser.close();
})();
