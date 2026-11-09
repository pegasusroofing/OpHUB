// The laptop's left menu (Andy, 9 Nov 2026, option A): a manager's items under Work, Team and Office headings; ▾ where a
// list opens underneath (▴ when open); "Finance", not "OpHUB Finance"; no OPHUB line under the company name. A PM without
// Finance has Admin alone under Office; an operative has no headings. Fake database. node desknav-groups-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const login = async (page) => {
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
// The menu's own text: everything left of 250px.
const menuText = (page) => page.evaluate(() => [...document.querySelectorAll('div[dir="auto"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right < 250; }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((e) => e.textContent.trim()).filter(Boolean));
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [name, role, fin] of [['admin', 'admin', true], ['pm', 'pm', false], ['operative', 'operative', false]]) {
    const {ctx, db} = await makeContext(browser, role, [], {viewport: {width: 1366, height: 900}});
    seed(db); db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = fin;
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await login(page);
    await page.goto(`${BASE}/home`); await page.waitForTimeout(5000);
    const m = await menuText(page);
    const at = (x) => m.indexOf(x);
    if (role === 'operative') check(at('WORK') < 0 && at('TEAM') < 0 && at('OFFICE') < 0 && at('OPHUB') < 0, `${name}: no headings (a short menu), no OPHUB line`);
    else {
      check(at('WORK') > at('Home') && at('Projects') > at('WORK') && at('Calendar') > at('Projects') && at('TEAM') > at('Calendar') && at('Hub') > at('TEAM') && at('Dashboard') > at('Hub') && at('OFFICE') > at('Dashboard') && at('Admin') > at('OFFICE'), `${name}: Home, then WORK (Projects … Calendar), TEAM (Hub, Dashboard), OFFICE (… Admin) [${m.slice(0, 22).join(' | ')}]`);
      check(fin ? at('Finance') > at('OFFICE') && at('OpHUB Finance') < 0 : at('Finance') < 0, fin ? `${name}: Finance under Office (not "OpHUB Finance")` : `${name}: no Finance (Admin alone under Office)`);
      check(at('OPHUB') < 0 && m.filter((x) => x === '▾').length >= 3, `${name}: no OPHUB line; ▾ beside the items that open`);
      await page.getByLabel('Show Projects pages').click(); await page.waitForTimeout(500);
      const m2 = await menuText(page);
      check(m2.includes('▴') && m2.includes('Sites Map'), `${name}: ▾ opens the list underneath (▴ when open)`);
      // Clicking Dashboard itself opens its list (Company, Operatives, HR), not straight to Company (Andy, 9 Nov 2026).
      await page.locator('text="Dashboard" >> visible=true').first().click(); await page.waitForTimeout(800);
      const m4 = await menuText(page);
      check(new URL(page.url()).pathname === '/home' && m4.includes('Company') && m4.includes('Operatives') && m4.includes('HR'), `${name}: clicking Dashboard shows Company, Operatives and HR (stays on ${new URL(page.url()).pathname})`);
      await page.locator('text="Operatives" >> visible=true').first().click(); await page.waitForTimeout(2500);
      check(new URL(page.url()).pathname === '/pm/operatives', `${name}: Operatives opens its dashboard`);
      await page.locator('text="Deliveries" >> visible=true').first().click(); await page.waitForTimeout(800);
      check(new URL(page.url()).pathname === '/pm/operatives' && (await menuText(page)).includes('Delivery Schedule'), `${name}: clicking Deliveries shows its list too`);
      await page.screenshot({path: `shots/desknav-${name}-dashboard.png`});
      await page.goto(`${BASE}/home`); await page.waitForTimeout(3000);
      await page.screenshot({path: `shots/desknav-${name}.png`});
      await page.goto(`${BASE}/sites/${S1}`); await page.waitForTimeout(5000);
      const m3 = await menuText(page);
      check(m3.includes('THIS PROJECT') && m3.includes('Project Home'), `${name}: inside a job, This Project still shows`);
      await page.screenshot({path: `shots/desknav-${name}-job.png`});
    }
    if (role === 'operative') await page.screenshot({path: `shots/desknav-${name}.png`});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
