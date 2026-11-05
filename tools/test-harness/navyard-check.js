// Laptop left menu: Deliveries opens out like Projects, with Delivery Schedule and Yard & Plant (Andy, 5 Nov 2026).
// node navyard-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/home'); await page.waitForTimeout(4000);
  await page.getByLabel('Show Projects pages').click(); await page.waitForTimeout(600);
  const proj = await page.evaluate(() => document.body.innerText);
  check(/Sites Map/.test(proj) && !/Delivery Schedule/.test(proj), 'Projects drop-down no longer holds Yard & Plant');
  await page.getByLabel('Show Deliveries pages').click(); await page.waitForTimeout(600);
  const t = await page.evaluate(() => document.body.innerText);
  check(/Delivery Schedule/.test(t), 'Deliveries opens out with Delivery Schedule');
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'navyard-open.png')});
  await page.getByText('Yard & Plant', {exact: true}).first().click(); await page.waitForTimeout(3000);
  check(/\/pm\/yard/.test(page.url()), 'Yard & Plant opens the yard');
  check(await page.getByText('Delivery Schedule', {exact: true}).count() > 0, 'on the yard page the Deliveries group stays open');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
