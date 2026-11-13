// A job's home, laid out again (Andy, 9 Nov 2026: option B): one info bar (job and client, today, on site and the
// weather, the pill and Check In / Out), the money strip, then the job's areas as rows: two columns on a laptop, one on
// a phone. An operative: Tasks Done, no money. Fake database. node job-home-rows-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const login = async (page) => {
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const box = async (page, label) => { const l = page.getByRole('button', {name: label}); let b = null; for (let i = 0; i < await l.count(); i++) { const x = await l.nth(i).boundingBox(); if (x && x.width > 0) b = x; } return b; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [name, vp, role] of [['laptop', {width: 1600, height: 1000}, 'admin'], ['small laptop', {width: 1280, height: 900}, 'admin'], ['phone', {width: 390, height: 844}, 'admin'], ['operative phone', {width: 390, height: 844}, 'operative']]) {
    const {ctx, db} = await makeContext(browser, role, [], {viewport: vp});
    seed(db); db.profiles[0].howto_dismissed = ['*'];
    if (role === 'operative') db.profiles[0].finance_enabled = false; // the seed turns Finance on for everyone
    Object.assign(db.sites.find((x) => x.id === S1), {client_name: 'Sovereign Housing', client_contact_name: 'Jo Bloggs', client_phone: '07700 900123', postcode: null});
    await ctx.route('**/api.postcodes.io/**', (r) => r.abort());
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await login(page);
    await page.goto(`${BASE}/sites/${S1}`); await page.waitForTimeout(6000);
    const t = await page.locator('body').innerText();
    const mgr = role !== 'operative';
    check(/Sovereign Housing/.test(t) && /Jo Bloggs( · |\n)07700 900123/.test(t) /* a phone puts the number on its own line (13 Nov) */ && /Nothing On/.test(t), `${name}: the info bar has the client, the contact and today`);
    check(mgr ? /\d+ On Site/.test(t) && /costs to date/i.test(t) && /invoiced to date/i.test(t) && /profit margin/i.test(t) : /Tasks Done/.test(t) && !/costs to date/i.test(t), mgr ? `${name}: on site, and the money strip` : `${name}: Tasks Done, no money`);
    check(!/Tap to log time/.test(t) && await page.getByRole('button', {name: 'Check In / Out'}).count() >= 1, `${name}: Check In / Out is a button in the info bar (no big tile)`);
    const sow = await box(page, /^Schedule of Works, /), hs = await box(page, /^Health & Safety, /), mat = await box(page, /^Materials, /), cal = await box(page, /^Calendar, /);
    const btn = await box(page, 'Check In / Out'), client = await box(page, /^Client: /) || await box(page, /^Today: /);
    check(!!sow && !!hs && !!mat && !!cal, `${name}: the areas are rows (Schedule of Works, Health & Safety, Materials, Calendar)`);
    if (btn && client && sow) {
      if (vp.width > 1100) check(Math.abs((btn.y + btn.height / 2) - (client.y + client.height / 2)) < 16 && btn.x > client.x + 300 && sow.y > btn.y + 30, `${name}: the info bar is one line, Check In / Out on its right, the rows below`);
      else check(btn.y > client.y && sow.y > btn.y, `${name}: the info bar (Check In / Out under the details), then the rows`);
    }
    if (sow && hs) {
      if (vp.width > 1100) check(Math.abs(sow.y - hs.y) < 4 && hs.x > sow.x + 100, `${name}: two columns of rows`);
      else check(hs.y > sow.y + 30 && Math.abs(hs.x - sow.x) < 4, `${name}: one column of rows`);
    }
    if (vp.width < 800 && mgr) check(/HUB/.test(t), `${name}: HUB is a row on a phone`);
    await page.screenshot({path: `shots/job-home-${name.replace(/ /g, '-')}.png`, fullPage: true});
    if (name === 'laptop') {
      await page.getByRole('button', {name: /^Schedule of Works, /}).click(); await page.waitForTimeout(2500);
      check(new URL(page.url()).pathname === `/sites/${S1}/schedule`, 'laptop: a row opens its area');
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
