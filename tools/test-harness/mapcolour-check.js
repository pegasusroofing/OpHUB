// The sites map on the PM home page: in colour from 5 Nov 2026, back to light grey Positron with darker roads on 14 Nov.
// Fake database, real map tiles and postcodes.
// node mapcolour-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}); const errs = []; const styles = [];
  for (const [W, H] of [[390, 844], [1300, 1000]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: H}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    page.on('request', (r) => { if (/openfreemap\.org\/styles\//.test(r.url())) styles.push(r.url()); });
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    await page.goto(B + '/home'); await page.waitForTimeout(9000);
    const canvas = page.locator('canvas').first();
    if (await canvas.count()) { await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(4000); }
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `mapcolour-${W}.png`)});
    await ctx.close();
  }
  // Back to light grey Positron (Andy, 14 Nov 2026), with the roads a shade darker and London's boroughs named.
  check(styles.some((u) => /positron/.test(u)) && !styles.some((u) => /liberty/.test(u)), `map uses the light grey Positron style (${[...new Set(styles)].join(', ') || 'no map loaded'})`);
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
