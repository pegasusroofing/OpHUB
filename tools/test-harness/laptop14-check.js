// Andy's laptop list of 14 Nov 2026, on a 1300-wide laptop with the fake database: the sign-in page with the old app's
// header; Home with four tiles (no HR, Deliveries or Calendar), no name / role / Sign out at the bottom, a bigger Next
// 5 Days and Today, a grey map with its count level with "Sites map"; the left-hand bar with the company colour at the
// top and Admin at the bottom above the name; Admin › Company › Home Page (PMs can be kept off the money); the yard as
// a table with the phone's columns and buttons; Purchases opening on Purchase Invoices from the Finance tabs; and the
// Export bar staying at the bottom of the screen. node laptop14-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const VP = {viewport: {width: 1300, height: 900}};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- Sign-in page ----
  {
    const {ctx} = await makeContext(browser, 'admin', [], VP);
    const page = await ctx.newPage();
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    const h = page.locator('[role="heading"] >> visible=true').first();
    const ht = (await h.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    check(ht === 'OpHUB - Welcome to your Operative Hub', `sign-in: the old app's header (${ht})`);
    const hb = await h.boundingBox();
    check(!!hb && hb.y < 40, 'sign-in: across the top');
    const card = await page.locator('input[placeholder="you@yourcompany.co.uk"]').boundingBox();
    const logo = await page.locator('[aria-label="OpHUB"] >> visible=true').first().boundingBox();
    check(!!card && card.width > 500 && card.width < 640, `sign-in: the box a comfortable width (${card && Math.round(card.width)})`);
    check(!!logo && !!card && logo.y + logo.height < card.y && Math.abs(logo.x + logo.width / 2 - (card.x + card.width / 2)) < 4, 'sign-in: the OpHUB logo sits above the box, centred');
    await page.screenshot({path: path.join(SHOTS, 'laptop-login.png')});
    await ctx.close();
    const {ctx: pc} = await makeContext(browser, 'admin', [], {shot: true});
    const pp = await pc.newPage();
    await pp.goto(B + '/login'); await pp.waitForTimeout(5000);
    await pp.screenshot({path: path.join(SHOTS, 'phone-login.png')});
    await pc.close();
  }
  const {ctx, db} = await makeContext(browser, 'admin', [], VP);
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true; me.howto_dismissed = ['*'];
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true, logo_path: `${db.organizations[0].id}/logo.png`});
  const O = db.organizations[0].id, S1 = db.sites[0].id;
  db.yard_stock = [{id: 'y1', org_id: O, item: 'Code 4 Lead', unit: 'roll', qty: 10, min_qty: 2, active: true, category: 'Lead & metals', location: 'Bay 2'}];
  db.yard_stock_rates = [{stock_id: 'y1', org_id: O, rate: 45.5}];
  db.purchase_orders = db.purchase_orders || [];
  for (let i = 1; i <= 40; i++) db.purchase_orders.push({id: `pox${i}`, org_id: O, site_id: S1, number: `J101-PO-${String(100 + i)}`, supplier_name: `Supplier ${i}`, status: 'open', value: 100 * i, total: 100 * i, items: [], created_at: '2026-10-20T09:00:00Z'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(7000);

  // ---- Home ----
  const body = await page.locator('body').innerText();
  const tiles = ['OpHUB Finance', 'Quotes', 'Dashboards', 'Reports & Surveys'];
  check(tiles.every((x) => body.includes(x)), 'home: Finance, Quotes, Dashboards, Reports & Surveys');
  check(!/Holidays, policies & handbook/.test(body), 'home: no HR tile on a laptop');
  check(await page.getByText('Sign out', {exact: true}).filter({visible: true}).count() === 1, 'home: Sign out only once (in the bar on the left)');
  const sz = await page.evaluate(() => {
    const byText = (t) => [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && d.innerText === t);
    const fs = (t) => { const e = byText(t); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
    const day = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && /^(Mon|Tue|Wed|Thu|Fri) \d+$/.test(d.innerText));
    const cv = document.querySelector('canvas');
    const sm = byText('Sites map'), cnt = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && /sites? on the map/.test(d.innerText));
    const base = (e) => { const r = e.getBoundingClientRect(); return r.bottom - parseFloat(getComputedStyle(e).fontSize) * 0.2; };
    return {next: fs('Next 5 Days'), day: day ? parseFloat(getComputedStyle(day).fontSize) : 0, today: fs('Today'), canvas: cv ? cv.style.filter : 'none',
      mapGap: sm && cnt ? Math.round(Math.abs(base(sm) - base(cnt))) : -1};
  });
  check(sz.next >= 18, `Next 5 Days heading bigger (${sz.next}px)`);
  check(sz.day >= 14.5, `the dates bigger (${sz.day}px)`);
  check(sz.today >= 16, `Today heading bigger (${sz.today}px)`);
  const row = await page.evaluate(() => { const e = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && /^\d+ on site$|^Nobody on site yet$/.test(d.innerText)); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; });
  check(row >= 15, `Today rows bigger (${row}px)`);
  check(sz.canvas === '' || sz.canvas === 'none', `the map is Positron with darker roads, no grey filter (${sz.canvas || 'none'})`);
  check(sz.mapGap >= 0 && sz.mapGap <= 2, `"sites on the map" sits level with "Sites map" (${sz.mapGap}px apart)`);
  // The words down the left start at the tiles' left edge; the logo and Calendar end at their right edge.
  const al = await page.evaluate(() => {
    const leaf = (re) => [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && re.test(d.innerText) && d.getBoundingClientRect().width > 0);
    const L = (e) => e ? Math.round(e.getBoundingClientRect().left) : -1;
    // Where the writing starts (15 Nov 2026: the date, greeting and headings start at the tiles' outer edge).
    const T = (e) => { if (!e) return -1; const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left); };
    const tile = [...document.querySelectorAll('[role="button"], a, div')].find((d) => /^\d+\s*Live projects$/i.test((d.innerText || '').trim()) && d.getBoundingClientRect().width < 400);
    const tr = tile ? tile.getBoundingClientRect() : null;
    const day = leaf(/^(Mon|Tue|Wed|Thu|Fri) \d+$/); const dayBox = day && day.closest('[role="button"]')?.parentElement; // the box (its name is a button inside it since 17 Nov 2026)
    const cal = document.querySelector('[aria-label="Open the calendar"]'); const lg = [...document.querySelectorAll('[aria-label$=" logo"]')].find((e) => e.getBoundingClientRect().width > 0);
    const notif = [...document.querySelectorAll('[role="button"], div')].find((d) => /^\d+\s*Notifications$/i.test((d.innerText || '').trim()) && d.getBoundingClientRect().width < 400);
    return { tileL: tr ? Math.round(tr.left) : -1, date: T(leaf(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d+ /)), hi: T(leaf(/^Good (morning|afternoon|evening)/)), next: T(leaf(/^Next 5 Days$/)), tileText: T(leaf(/^Live projects$/)), dayL: dayBox ? Math.round(dayBox.getBoundingClientRect().left) : -1,
      tileR: notif ? Math.round(notif.getBoundingClientRect().right) : -1, calR: cal ? Math.round(cal.getBoundingClientRect().right) : -1, logoR: lg ? Math.round(lg.getBoundingClientRect().right) : -1 };
  });
  check([al.date, al.hi, al.next, al.dayL].every((x) => Math.abs(x - al.tileL) <= 1), `left side: the date, greeting and Next 5 Days start at the tiles' outer edge (${JSON.stringify(al)})`);
  check([al.calR, al.logoR].every((x) => Math.abs(x - al.tileR) <= 1), 'right side lines up with the tiles');
  // The Calendar button is the same height as the Next 5 Days heading (15 Nov 2026).
  const hh = await page.evaluate(() => { const h = [...document.querySelectorAll('div')].find((d) => !d.children.length && d.innerText === 'Next 5 Days'); const c = document.querySelector('[aria-label="Open the calendar"]'); return { heading: h ? Math.round(h.getBoundingClientRect().height) : -1, button: c ? Math.round(c.getBoundingClientRect().height) : -2 }; });
  check(hh.heading > 0 && Math.abs(hh.heading - hh.button) <= 1, `the Calendar button is the same height as Next 5 Days (${JSON.stringify(hh)})`);
  await page.screenshot({path: path.join(SHOTS, 'laptop-home.png')});
  await page.screenshot({path: path.join(SHOTS, 'laptop-home-full.png'), fullPage: true});

  // ---- The bar on the left ----
  const top = await page.locator('[aria-label$=": Home"] >> visible=true').first();
  const bg = await top.evaluate((e) => getComputedStyle(e).backgroundColor);
  check(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(22, 24, 29)', `the top of the bar is in the company colour (${bg})`);
  check((await top.innerText()).includes('OpHUB'), 'the company name with OpHUB under it');
  const adminY = (await page.getByText('Admin', {exact: true}).filter({visible: true}).first().boundingBox())?.y || 0;
  const finY = (await page.getByText('Finance', {exact: true}).filter({visible: true}).first().boundingBox())?.y || 0;
  const nameY = (await page.getByText('Company Admin', {exact: true}).filter({visible: true}).first().boundingBox().catch(() => null))?.y || 0;
  check(adminY > finY + 60 && nameY > adminY && nameY - adminY < 80, `Admin at the bottom, just above the name (${Math.round(finY)} / ${Math.round(adminY)} / ${Math.round(nameY)})`);

  // ---- Admin › Company: no Home Page since 18 Nov (Money On Home is a part on Admin › Roles) ----
  await page.goto(B + '/pm/admin?page=company'); await page.waitForTimeout(3500);
  check(await page.getByText('Home Page', {exact: true}).filter({visible: true}).count() === 0, 'Admin › Company has no Home Page (it is in Roles now)');
  await page.goto(B + '/pm/admin/hometiles'); await page.waitForTimeout(3500);
  check(/Money On Home Is In Roles Now/.test(await page.evaluate(() => document.body.innerText)), 'an old link to the Home Page points to Roles');
  await page.screenshot({path: path.join(SHOTS, 'laptop-hometiles.png')});

  // ---- Yard ----
  await page.goto(B + '/fin/yard'); await page.waitForTimeout(4500);
  const yt = await page.locator('body').innerText();
  check(/In Stock/i.test(yt) && /Unit Price/i.test(yt) && /Code 4 Lead/.test(yt), 'yard: a table of Item, In Stock, Unit Price, Value');
  check(!/\bLocation\b/.test(yt.split('Code 4 Lead')[0]) && await page.locator('[aria-label^="Issue "] >> visible=true').count() === 0, 'yard: no Location column and no Issue button on the row');
  const bw = (await page.getByText('⬆ Book Out', {exact: true}).filter({visible: true}).first().boundingBox())?.width || 0;
  check(bw > 0 && bw < 220, `yard: the phone's buttons, not stretched (${Math.round(bw)}px)`);
  await page.screenshot({path: path.join(SHOTS, 'laptop-yard.png')});

  // ---- Price Lists on a laptop ----
  await page.goto(B + '/fin/purchases?tab=prices'); await page.waitForTimeout(4500);
  const pl = await page.locator('body').innerText();
  check(!/Price Book/.test(pl) && (await page.locator('[aria-label="Price lists"] >> visible=true').count() === 1 || /No prices yet/.test(pl)) && /Add A Supplier/.test(pl), 'price lists: one table of suppliers, no Price Book');
  await page.screenshot({path: path.join(SHOTS, 'laptop-pricelists.png')});

  // ---- Purchases from the Finance tabs ----
  await page.goto(B + '/fin/purchases?tab=orders'); await page.waitForTimeout(4500);
  const fb = await page.locator('[aria-label="Export footer"] >> visible=true').first().boundingBox();
  check(!!fb && Math.abs(fb.y + fb.height - 900) < 4, `Export bar sits at the bottom of the screen (${fb && Math.round(fb.y + fb.height)})`);
  await page.screenshot({path: path.join(SHOTS, 'laptop-export-footer.png')});
  await page.getByRole('tab', {name: 'Purchases'}).filter({visible: true}).first().click(); await page.waitForTimeout(3000);
  check(/tab=invoices/.test(page.url()), `Purchases tab opens on Purchase Invoices (${page.url().split('8081')[1]})`);

  // ---- Variations: no Costs By Plot on a single-site project ----
  db.sites[0].multi_site = false; db.sites[0].repair_contract = false;
  await page.goto(B + `/fin/job/${S1}/variations`); await page.waitForTimeout(4500);
  check(await page.getByText('Costs By Plot', {exact: true}).filter({visible: true}).count() === 0 && await page.getByText('Plots', {exact: true}).filter({visible: true}).count() >= 1, 'variations: a single-site project has no Costs By Plot tab');
  db.sites[0].multi_site = true;
  await page.reload(); await page.waitForTimeout(5000);
  check(await page.getByText('Costs By Plot', {exact: true}).filter({visible: true}).count() >= 1, 'variations: a multi-site project keeps Costs By Plot');

  // ---- A PM kept off the money ----
  // The company's old Home Page answer (No for project managers) still counts while the PM's role isn't set on the board.
  db.organizations[0].home_tiles = {...(db.organizations[0].home_tiles || {}), finance_pm: false};
  me.role = 'pm';
  await page.goto(B + '/home'); await page.waitForTimeout(5000);
  const pt = await page.locator('body').innerText();
  check(!/Due In/.test(pt) && !/OpHUB Finance/.test(pt) && /On site now/.test(pt), 'a PM (with Finance on) sees no money on Home once set to No');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
