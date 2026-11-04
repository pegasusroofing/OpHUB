// Job Messages send row (4 Nov 2026), fake database only: Send is three quarters, a Send To drop-down the last quarter
// (Site Operatives / All Operatives / All Managers Only), no pop-up on Send.
// node msgsend-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/sites/' + S1 + '/messages'); await page.waitForTimeout(4500);
  const send = page.getByText('Send', {exact: true}).first(), dd = page.getByLabel('Send To').first();
  check(await dd.count() > 0, 'Send To drop-down shows');
  const [a, b] = [await send.evaluate((el) => el.closest('[role=button]')?.getBoundingClientRect().width || 0), await dd.evaluate((el) => el.getBoundingClientRect().width)];
  check(a > b * 2.2 && a < b * 3.8, `Send is about three times the drop-down (${Math.round(a)} vs ${Math.round(b)})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'msgsend-phone.png')});
  const n0 = (db.messages || []).length;
  await page.getByPlaceholder(/Message to operatives/).fill('Test to site'); await send.click(); await page.waitForTimeout(1500);
  const m1 = (db.messages || []).slice(n0)[0];
  check(m1 && m1.audience === 'operatives' && m1.site_id === S1, 'default goes to this site\'s operatives, no pop-up');
  await dd.click(); await page.waitForTimeout(500); await page.getByText('All Managers Only', {exact: true}).last().click(); await page.waitForTimeout(500);
  await page.getByPlaceholder(/Message to the managers/).fill('Test to managers'); await send.click(); await page.waitForTimeout(1500);
  const m2 = (db.messages || []).slice(n0)[1];
  check(m2 && m2.audience === 'managers' && m2.site_id === S1, 'All Managers Only goes to the managers');
  await dd.click(); await page.waitForTimeout(500); await page.getByText('All Operatives', {exact: true}).last().click(); await page.waitForTimeout(500);
  await page.getByPlaceholder(/Message to operatives/).fill('Test to all'); await send.click(); await page.waitForTimeout(1500);
  const m3 = (db.messages || []).slice(n0)[2];
  check(m3 && m3.audience === 'operatives' && m3.site_id === null, 'All Operatives goes company-wide');
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
