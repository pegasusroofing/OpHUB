// Home page and iPhone (Andy, 19 Nov 2026): "there is no weather tile on home page of construction?", "remove delivery
// drivers from the tiles that go next to weather please", and "when I press the top of the screen everywhere else it
// takes me to the top of the page but in this it doesn't". Fake database. node home19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // 1. A company with no projects: the weather is for the company's own postcode.
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
    db.sites = []; db.organizations[0].rams_settings = {address: 'Unit 7\nRunwell Hall Farm, Hoe Lane\nRettendon, CM3 8DQ', phone: '01268 000000'};
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    const wx = await page.locator('[aria-label^="Weather"]').count();
    check(wx > 0, `no projects yet: there is a weather tile, from the company's postcode (${wx})`);
    await ctx.close();
  }
  // 2. Today's tiles leave out the drivers' deliveries.
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
    db.site_calendar_events = [
      {id: 'ev1', site_id: S1, title: 'Delivery: Finish clearing site', event_date: today(), created_at: new Date().toISOString()},
      {id: 'ev2', site_id: S1, title: 'Scaffold inspection', event_date: today(), created_at: new Date().toISOString()},
    ];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    const t = await page.locator('body').innerText();
    // The Today tiles by the weather, not the Next 5 Days calendar under them (deliveries stay on the calendar).
    const todayPart = t.split('Next 5 Days')[0];
    check(/Scaffold inspection/.test(todayPart) && !/Delivery: Finish clearing site/.test(todayPart), 'the Today tiles by the weather show key dates, not the drivers\' deliveries');
    await page.screenshot({path: path.join(__dirname, 'shots', 'home19-today.png')});
    await ctx.close();
  }
  // 3. iPhone: tapping the top of the screen (the page going to 0) takes the open list back to the top.
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}, userAgent: IPHONE, hasTouch: true, isMobile: true});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
    await ctx.addInitScript((ua) => { Object.defineProperty(navigator, 'userAgent', {get: () => ua}); }, IPHONE);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(d).overflowY)).sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!el) return {found: false};
      el.setAttribute('data-test-scroller', '1'); el.scrollTop = 400;
      return {found: true, top: el.scrollTop, page: window.scrollY};
    });
    check(before.found && before.top > 0 && before.page === 1, `the page sits on its spare pixel and the list is scrolled down (${JSON.stringify(before)})`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({top: document.querySelector('[data-test-scroller]').scrollTop, page: window.scrollY}));
    check(after.top === 0 && after.page === 1, `tapping the top takes the list back to the top, ready for the next tap (${JSON.stringify(after)})`);
    // Not while typing: the keyboard moves the page too.
    await page.evaluate(() => { document.querySelector('[data-test-scroller]').scrollTop = 300; });
    const input = page.locator('input:visible').first();
    if (await input.count()) {
      await input.focus(); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200);
      const typing = await page.evaluate(() => document.querySelector('[data-test-scroller]').scrollTop);
      check(typing > 0, `while typing, the page moving doesn't jump the list (${typing})`);
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
