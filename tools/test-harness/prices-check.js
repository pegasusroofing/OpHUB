// Purchases › Price lists (4 Nov 2026): one tab holding Price book and Price lists as its own two tabs.
// node prices-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch();
  for (const width of [1300, 390]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width, height: width < 500 ? 844 : 900}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true;
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/fin/purchases'); await page.waitForTimeout(3500);
    check(await page.getByText('Price book', {exact: true}).count() === 0, `${width}: no separate Price book tab`);
    await page.getByText('Price lists', {exact: true}).first().click(); await page.waitForTimeout(2000);
    check(page.url().includes('tab=pricebook') && await page.getByText('Price book', {exact: true}).count() === 1, `${width}: Price lists opens on the Price book tab`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `prices-${width}-book.png`)});
    await page.getByText('Price lists', {exact: true}).last().click(); await page.waitForTimeout(2000);
    check(page.url().includes('tab=pricelists'), `${width}: second tab shows the Price lists`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `prices-${width}-lists.png`)});
    check(!errs.length, `${width}: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
})();
