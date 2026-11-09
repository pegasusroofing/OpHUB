// The header (Andy, 9 Nov 2026): tapping the address under the title copies the site's name and address together, on
// any page of the job; tapping the bold title still goes home (Projects, for a job's pages). Phone and laptop, fake database.
// node header-copy-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [name, vp] of [['phone', {width: 390, height: 844}], ['laptop', {width: 1366, height: 900}]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: vp});
    seed(db); db.profiles[0].howto_dismissed = ['*']; db.sites.find((x) => x.id === S1).name = 'Oakwood Court';
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: BASE});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${BASE}/sites/${S1}/hs`); await page.waitForTimeout(5000);
    await page.getByRole('button', {name: /Studley Rd, London/}).first().click(); await page.waitForTimeout(800);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip === 'Oakwood Court, Studley Rd, London, SW4 6RZ', `${name}: the address tap copies the site name and address (“${clip}”)`);
    check(/Copied/.test(await page.locator('body').innerText()), `${name}: it says Copied`);
    const links = page.getByRole('link', {name: 'Health & Safety'}); let top = null, ty = 1e9; for (let i = 0; i < await links.count(); i++) { const b = await links.nth(i).boundingBox(); if (b && b.y < ty && b.x > (vp.width > 800 ? 260 : 0)) { ty = b.y; top = links.nth(i); } } await top.click(); await page.waitForTimeout(2500);
    check(new URL(page.url()).pathname === '/sites', `${name}: the bold title still goes home, to Projects (${new URL(page.url()).pathname})`);
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
