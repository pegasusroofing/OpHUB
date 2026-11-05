// Finance job bar has Go To Project next to + New, which opens the job in Projects; the PM home tiles use
// Finance's text style (Andy, 5 Nov 2026). Fake database only.
// node gotoproject-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const W of [390, 1300]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: 844}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*']; me.finance_enabled = true;
    const S1 = db.sites[0].id;
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/home'); await page.waitForTimeout(6000);
    const w = await page.getByText('Quotes', {exact: true}).last().evaluate((e) => getComputedStyle(e).fontWeight);
    check(w === '600', `${W}: tile name is semi-bold like Finance (${w})`);
    await page.getByText('Quotes', {exact: true}).last().scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `hometext-${W}.png`)});
    await page.goto(B + '/fin/job/' + S1); await page.waitForTimeout(6000);
    const btn = page.getByText('Go To Project', {exact: true});
    check(await btn.count() === 1 && await page.getByText('+ New').count() >= 1, `${W}: Go To Project sits beside + New`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `gotoproject-${W}.png`)});
    await btn.click(); await page.waitForTimeout(3000);
    check(new URL(page.url()).pathname === '/sites/' + S1, `${W}: it opens the job in Projects (${new URL(page.url()).pathname})`);
    await ctx.close();
  }
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
