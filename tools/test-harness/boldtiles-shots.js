// PM home with bold colour tiles (option B, Andy 5 Nov 2026): phone and laptop screenshots. Fake database only.
// node boldtiles-shots.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [W, H] of [[390, 844], [1300, 1000]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: H}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/home'); await page.waitForTimeout(5000);
    if (W < 500) await page.getByText('Quotes', {exact: true}).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `boldtiles-${W}.png`)});
    await ctx.close();
  }
  console.log('errors:', errs.length ? errs.slice(0, 2).join(' | ') : 'none');
  await browser.close();
})();
