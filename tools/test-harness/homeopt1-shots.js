// Home and left menu, option 1 (Andy, 6 Nov 2026): charcoal menu, plain counts, map beside a Today panel, bigger plain
// tiles. Screenshots: laptop home, phone home, and a Finance page with the menu. Fake database only.
// node homeopt1-shots.js
const {chromium, makeContext} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [W, H, u, n] of [[1300, 900, '/home', 'home-1300'], [390, 844, '/home', 'home-390'], [1300, 900, '/fin', 'fin-1300']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: H}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*']; me.finance_enabled = true;
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto('http://localhost:8081' + u); await page.waitForTimeout(6000);
    if (u === '/home') {
      check(await page.getByText('Today', {exact: true}).count() >= 1, `${n}: the Today panel`);
      check(await page.getByText('Live projects', {exact: true}).count() >= 2, `${n}: the red Live projects card (phone and laptop)`);
      check(await page.getByRole('button', {name: 'Projects', exact: true}).count() === 0, `${n}: no separate Projects tile`);
      if (W < 500) {
        // The Today bar drifts sideways on its own, and stops when touched.
        const bar = page.locator('[data-testid="today-bar"]'); const left = () => bar.evaluate((e) => e.scrollLeft);
        const x1 = await left(); await page.waitForTimeout(1500); const x2 = await left();
        check(x2 > x1 + 10, `${n}: the Today bar scrolls on its own (${Math.round(x1)} → ${Math.round(x2)})`);
        await bar.evaluate((e) => { const t = new Touch({identifier: 1, target: e, clientX: 60, clientY: e.getBoundingClientRect().y + 20}); const ev = (k) => new TouchEvent(k, {touches: k === 'touchend' ? [] : [t], targetTouches: k === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true}); e.dispatchEvent(ev('touchstart')); e.dispatchEvent(ev('touchend')); }); const x3 = await left(); await page.waitForTimeout(1500); const x4 = await left();
        check(Math.abs(x4 - x3) < 2, `${n}: and stops when touched (${Math.round(x3)} → ${Math.round(x4)})`);
      }
    }
    await page.screenshot({path: `shots/job/opt1-${n}.png`});
    await ctx.close();
  }
  check(!errs.length, 'no errors ' + errs.slice(0, 2).join(' | '));
  await browser.close();
})();
