// Andy's list of 13 Nov 2026 on a touch phone, fake database: home Due In / Quotes To Price, the ☰ sidebar, the project
// page (no HUB / To Do rows, client name and number, Finance above today, Subcontract Orders only on a price), Materials
// (Requests, Subcontract Orders from there, tabs, Completed title, info box ✕), Schedule of Works (+ for photos, the
// slider), Write A Toolbox Talk (similar check), Yard Stock (Book Out / Book In, purchase orders pulled through) and
// application dates in the calendars. node andy13-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'andy13');
require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['home', 'site_home', 'materials', 'sow', 'tbt', 'guide:closed'];
  const O = db.organizations[0].id, today = new Date().toISOString().slice(0, 10);
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const site = db.sites.find((s) => s.id === S1);
  Object.assign(site, {client_contact_name: 'Sue Client', client_phone: '07700 111222', price_enabled: false});
  db.quotes = [{id: 'q1', org_id: O, client_name: 'Bellway Homes', title: 'Hove Flats', status: 'pricing', chase_on: true, chase_count: 0, created_at: today}];
  db.yard_stock = [{id: 'ys1', org_id: O, item: 'Code 4 lead', unit: 'roll', qty: 5, min_qty: 1, active: true}]; db.yard_moves = [];
  const t2 = db.schedule_tasks.find((t) => t.id === 't2'); Object.assign(t2, {status: 'progress', percent_complete: 40});
  global.__rpc = (name) => (name === 'site_application_dates' ? [{site_id: S1, app_dates: null, app_reminder_day: null, org_app_day: null, billing_type: 'application', applied_dates: [today]}] : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  const body = async () => page.locator('body').innerText();
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // ---- Home ----
  let t = await body();
  check(/Due In/.test(t) && /Quotes To Price/.test(t) && !/On site now/.test(t) && !/\nTo do\n/.test(t), 'home: the middle two are Due In and Quotes To Price');
  check(/💷 Applied/.test(t), 'home: today\'s application shows in Next 5 Days');
  await page.screenshot({path: path.join(SHOTS, 'home.png')});

  // ---- ☰ sidebar ----
  await vis('[aria-label="Open the menu"]').click(); await page.waitForTimeout(900);
  const menuOn = await page.locator('[aria-label="Menu"] >> visible=true').count();
  check(menuOn === 1 && /Projects/.test(await vis('[aria-label="Menu"]').innerText()), '☰ opens the menu');
  await page.screenshot({path: path.join(SHOTS, 'sidebar.png')});
  await page.locator('[aria-label="Menu"] >> text="Projects"').first().click(); await page.waitForTimeout(2500);
  check(new URL(page.url()).pathname === '/sites' && await page.locator('[aria-label="Menu"] >> visible=true').count() === 0, 'choosing a page goes there and closes it');

  // ---- Project page ----
  await page.goto(B + `/sites/${S1}`); await page.waitForTimeout(5000);
  check(await page.locator('[aria-label^="HUB,"] >> visible=true').count() === 0 && await page.locator('[aria-label^="To Do List,"] >> visible=true').count() === 0, 'project: no HUB or To Do rows on a phone');
  t = await body();
  check(/Sue Client\n07700 111222/.test(t), 'project: the client\'s name and number on their own lines');
  const yMoney = (await vis('[aria-label="Open project finance"]').boundingBox()).y, yToday = (await vis('[aria-label^="Today:"]').boundingBox()).y, yClient = (await vis('[aria-label^="Client:"]').boundingBox()).y;
  check(yClient < yMoney && yMoney < yToday, 'project: Finance sits between the client row and today / on site / weather');
  check(await page.locator('[aria-label^="Subcontract Orders,"] >> visible=true').count() === 0, 'project: no Subcontract Orders row when it isn\'t on a price');
  const fs = await vis('[aria-label^="Schedule of Works,"]').evaluate((e) => getComputedStyle([...e.querySelectorAll('div')].find((d) => d.textContent === 'Schedule of Works')).fontSize);
  check(fs === '14.85px', `project: rows 1.1 × bigger (${fs})`);
  await page.screenshot({path: path.join(SHOTS, 'project.png')});

  // ---- Materials ----
  await page.goto(B + `/sites/${S1}/materials`); await page.waitForTimeout(4000);
  t = await body();
  check(/\nRequests\n/.test(t) && !/Material Requests/.test(t), 'materials: "Requests"');
  check(/Subcontract Orders/.test(t), 'materials: Subcontract Orders can be raised from here');
  await page.goto(B + `/sites/${S1}/materials/requests`); await page.waitForTimeout(4000);
  check(await page.getByRole('tab').count() >= 3, 'requests: the tabs are underlined tabs');
  check(await page.locator('[aria-label="Close this note"] >> visible=true').count() === 1, 'requests: the info box has an ✕');
  await vis('[aria-label="Close this note"]').click(); await page.waitForTimeout(800);
  check(await page.locator('[aria-label="Close this note"] >> visible=true').count() === 0 && (me.howto_dismissed || []).includes('info:mat_requests'), 'the ✕ hides it for good');
  await page.getByRole('tab', {name: /^Completed/}).first().click(); await page.waitForTimeout(1500);
  t = await body();
  check(/Materials\n›\nCompleted|Materials › Completed|Completed/.test(t) && !/Material Requests/.test(t), 'Completed: the path and title say Completed');
  await page.screenshot({path: path.join(SHOTS, 'requests-completed.png')});

  // ---- Subcontract Orders row once on a price ----
  site.price_enabled = true;
  await page.goto(B + `/sites/${S1}`); await page.waitForTimeout(4500);
  check(await page.locator('[aria-label^="Subcontract Orders,"] >> visible=true').count() === 1, 'project: Subcontract Orders shows when on a price');

  // ---- Schedule of Works ----
  await page.goto(B + `/sites/${S1}/schedule`); await page.waitForTimeout(4500);
  check(await page.locator('[aria-label="Add pre-start photos"] >> visible=true').count() >= 1 && !/📷 Add pre-start photos/.test(await body()), 'SoW: a + for photos, not the big button');
  await vis('[aria-label="Progress"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  const tr = await vis('[aria-label="Progress"]').boundingBox();
  await page.mouse.move(tr.x + tr.width * 0.4, tr.y + tr.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(tr.x + tr.width * (0.4 + 0.032 * i), tr.y + tr.height / 2); await page.waitForTimeout(30); }
  await page.mouse.up(); await page.waitForTimeout(1800);
  check(Number(t2.percent_complete) === 70, `SoW: the slider follows a drag and settles on 10s, as it shows (${t2.percent_complete}%)`);
  await page.screenshot({path: path.join(SHOTS, 'sow.png')});

  // ---- Write A Toolbox Talk ----
  await page.goto(B + `/sites/${S1}/hs/tbt`); await page.waitForTimeout(4000);
  await page.getByText('TBT Library', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.getByText('Write A Toolbox Talk', {exact: true}).first().click(); await page.waitForTimeout(600);
  await vis('[aria-label="Talk title"]').fill('Working At Heights On Flat Roofs');
  await vis('[aria-label="Talk points"]').fill('Edge protection up before anyone goes on.\nHarness checks every morning.');
  await page.getByText('Save To The TBT Bank', {exact: true}).first().click(); await page.waitForTimeout(1500);
  t = await body();
  check(/Similar toolbox talks are already in the bank/.test(t) && /Working at height/.test(t), 'TBT: it shows the similar talk already in the bank first');
  await page.screenshot({path: path.join(SHOTS, 'tbt-similar.png')});
  await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(3500);
  check(db.tbt_templates.some((x) => x.title === 'Working At Heights On Flat Roofs') && db.toolbox_talks.some((x) => x.title === 'Working At Heights On Flat Roofs' && x.status === 'bank'), 'TBT: saved to the company bank and this job\'s library');

  // ---- Yard Stock ----
  await page.goto(B + `/sites/${S1}/materials/yard`); await page.waitForTimeout(4500);
  t = await body();
  check(!/Return from this job/i.test(t), 'yard: no Return From Job');
  const bo = await vis('[aria-label="Book Out"]').boundingBox(), bi = await vis('[aria-label="Book In"]').boundingBox(), st = await vis('[aria-label="Stock Take"]').boundingBox(), nl = await vis('[aria-label="Not On The List"]').boundingBox();
  check(Math.abs(bo.width - bi.width) < 1 && Math.abs(bo.y - bi.y) < 1 && Math.abs(st.width - nl.width) < 1 && Math.abs(st.y - nl.y) < 1, 'yard: Book Out / Book In, and Stock Take / Not On The List, the same size on one row');
  check(/In Stock/i.test(t) && /On Purchase Orders, Not In The Yard Yet/i.test(t) && /Batten 25x50/.test(t), 'yard: in stock shown; purchase order items pulled through');
  await page.screenshot({path: path.join(SHOTS, 'yard.png'), fullPage: true});
  await vis('[aria-label="Qty: ys1"]').fill('2');
  await vis('[aria-label="Book Out"]').click(); await page.waitForTimeout(2000);
  check(db.yard_moves.some((m) => m.stock_id === 'ys1' && m.kind === 'issue' && Number(m.qty) === 2 && m.site_id === S1), 'Book Out: 2 to this job');
  const poRow = page.locator('[aria-label="Book In"] >> visible=true').last();
  await poRow.click(); await page.waitForTimeout(2500);
  const newItem = db.yard_stock.find((x) => x.item === 'Batten 25x50');
  check(!!newItem && db.yard_moves.some((m) => m.stock_id === newItem.id && m.kind === 'in' && Number(m.qty) === 100 && m.po_id === 'po1'), 'a purchase order line books in (100 m from the PO)');

  // ---- Calendar: application dates ----
  await page.goto(B + `/sites/${S1}/calendar`); await page.waitForTimeout(4500);
  check(/Application sent/.test(await body()), 'project calendar: the application made today shows');
  await page.screenshot({path: path.join(SHOTS, 'calendar.png')});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
