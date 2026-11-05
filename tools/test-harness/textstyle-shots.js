// Finance-style text across the whole app (Andy, 5 Nov 2026): semi-bold titles and names, no extra-bold. Screenshots of
// a job page, Health & Safety and the operative home. Fake database only.
// node textstyle-shots.js
const {chromium, makeContext, S1} = require('./harness');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [role, W, path, name] of [['admin', 390, `/sites/${S1}`, 'job'], ['admin', 1300, `/sites/${S1}/hs`, 'hs'], ['operative', 390, '/sites', 'op']]) {
    const {ctx, db} = await makeContext(browser, role, [], {viewport: {width: W, height: 844}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); if (role === 'admin') me.role = 'admin'; me.howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto('http://localhost:8081' + path); await page.waitForTimeout(5000);
    const heavy = await page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.childElementCount === 0 && e.textContent.trim() && Number(getComputedStyle(e).fontWeight) >= 700).map((e) => e.textContent.trim()).slice(0, 8));
    console.log(name, 'bold text left:', heavy.join(' | ') || 'none');
    await page.screenshot({path: `shots/job/textstyle-${name}-${W}.png`});
    await ctx.close();
  }
  console.log('errors', errs.length ? errs.slice(0, 2).join(' | ') : 'none');
  await browser.close();
})();
