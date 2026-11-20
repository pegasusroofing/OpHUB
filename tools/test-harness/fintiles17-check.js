// Finance › Overview's tiles (Andy, 17 Nov 2026). First: "Can we have the tiles in finance Home Screen customisable
// with an ellipsis? ... move qty of jobs as a note to the 1st tile? Then put money due out as the 5th tile". Then: "The
// due out to suppliers needs to include the money to check but note x amount requires approval. I also meant the tiles
// on the finance home page choosable by item they relate to, so live contract value then ellipsis for all contract
// values, all by date, all closed, all upcoming ... Owed to you, same sort of thing, next 30 days, next 60 days, by date,
// by client etc ... keep positions fixed". So: six tiles always in the same places; each tile's ⋯ changes what its own
// figure covers; kept for the person; Due Out = every unpaid supplier invoice (approved or not, incl. VAT; not paid
// ones, not ones paid on a statement, not subcontract ones), the note saying how much needs approval.
// Also Home's Today row on a phone snaps to the tiles' edges ("the spacing between the weather and who's on site ...
// looks out of align"). Phone, then laptop. Fake database. node fintiles17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'fintiles17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const NAMES = ['Contract Value', 'Still To Invoice', 'Owed To You', 'Overdue', 'Due Out To Suppliers', 'Retention Held By Clients'];

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*'], fin_home_tiles: ['live_value', 'due_out']}); // yesterday's swap list: ignored
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const O = db.organizations[0].id;
  Object.assign(db.sites.find((s) => s.id === S1), {client_name: 'Bellway Homes'});
  db.job_finance = [{site_id: S1, org_id: O, billing_type: 'invoice', contract_value: 48000}];
  db.fin_invoices = [
    {id: 'si1', org_id: O, site_id: S1, number: 'INV-1', status: 'issued', issue_date: iso(-20), due_date: iso(10), total: 1200, net: 1000, paid: 0},
    {id: 'si2', org_id: O, site_id: S1, number: 'INV-2', status: 'issued', issue_date: iso(-80), due_date: iso(-45), total: 600, net: 500, paid: 0},
  ];
  db.purchase_invoices = [
    {id: 'pi1', org_id: O, site_id: S1, supplier_name: 'SIG Roofing', invoice_no: 'A1', invoice_date: '2026-11-01', due_date: iso(-3), net: 1800, vat: 360, total: 2160, status: 'approved', created_at: '2026-11-01T09:00:00Z'},
    {id: 'pi2', org_id: O, site_id: S1, supplier_name: 'SIG Roofing', invoice_no: 'A2', invoice_date: '2026-11-02', due_date: iso(20), net: 400, vat: 80, total: 480, status: 'to_approve', created_at: '2026-11-02T09:00:00Z'},
    {id: 'pi3', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'B1', invoice_date: '2026-10-02', net: 1000, vat: 200, total: 1200, status: 'approved', paid_on: '2026-11-03', created_at: '2026-10-02T09:00:00Z'},
    {id: 'pi4', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'B2', invoice_date: '2026-10-05', net: 500, vat: 100, total: 600, status: 'approved', created_at: '2026-10-05T09:00:00Z'},
    {id: 'pi5', org_id: O, site_id: S1, supplier_name: 'Ace Subbies', invoice_no: 'S1', invoice_date: '2026-11-05', net: 9000, vat: 0, total: 9000, status: 'approved', sub_job_id: 'sj1', created_at: '2026-11-05T09:00:00Z'},
    {id: 'pi6', org_id: O, site_id: S1, supplier_name: 'Travis Perkins', invoice_no: 'T1', invoice_date: '2026-11-06', due_date: iso(40), net: 250, vat: 50, total: 300, status: 'approved', created_at: '2026-11-06T09:00:00Z'},
  ];
  db.fin_statements = [{id: 'st1', org_id: O, supplier_name: 'Jewson', status: 'reconciled', statement_date: '2026-10-31', lines: [{id: 'l1', type: 'invoice', amount: 600, match: 'pi4'}]}];
  // Enough key dates today for the phone's Today row to scroll (drivers' deliveries no longer show there, 20 Nov 2026).
  { const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    db.site_calendar_events = (db.site_calendar_events || []).concat(['Scaffold inspection', 'Skip swap', 'Client walk-round'].map((title, i) => ({id: 'kd' + i, site_id: S1, title, event_date: t, created_at: new Date().toISOString()}))); }
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (/cannot contain a nested|cannot be a descendant/.test(m.text())) errs.push(m.text().slice(0, 90)); });
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  // The six tiles by their ⋯ (always "Change tile N: Name"), and what tile N says.
  const order = () => page.evaluate(() => [...document.querySelectorAll('[aria-label^="Change tile "]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label').replace(/^Change tile \d+: /, '')));
  const tile = (n) => page.evaluate((i) => { const b = [...document.querySelectorAll(`[aria-label^="Change tile ${i}:"]`)].find((e) => e.getBoundingClientRect().width > 0); return b ? b.parentElement.innerText.replace(/\n?⋯/, '').split('\n').join(' / ') : ''; }, n);
  const pick = async (n, ...labels) => {
    await vis(`[aria-label^="Change tile ${n}:"]`).click(); await page.waitForTimeout(700);
    for (const l of labels) { await page.getByText(l, {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(900); }
    await page.waitForTimeout(800);
  };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // ---- Home's Today row (phone) ----
  await page.goto(B + '/home'); await page.waitForTimeout(5000);
  const snap = await page.evaluate(() => { const b = document.querySelector('[data-testid="today-bar"]'); const kid = b && b.querySelector(':scope > div > div'); return {type: b ? getComputedStyle(b).scrollSnapType : '', align: kid ? getComputedStyle(kid).scrollSnapAlign : ''}; });
  check(/x mandatory/.test(snap.type) && /start/.test(snap.align), `phone Home: the Today row snaps to each tile's edge (${snap.type} / ${snap.align})`);
  const bar = await vis('[data-testid="today-bar"]').boundingBox();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2); await page.mouse.wheel(130, 0); await page.waitForTimeout(1200); // more than half a tile, so it snaps on to the next (20 Nov 2026)
  const al = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="today-bar"]'); const leaf = (t) => [...document.querySelectorAll('div[dir="auto"]')].find((e) => e.textContent.trim() === t && e.getBoundingClientRect().width > 0);
    let q = leaf('Quotes'); while (q && getComputedStyle(q).borderTopWidth === '0px') q = q.parentElement;
    const lefts = [...b.querySelectorAll(':scope > div > div')].map((e) => Math.round(e.getBoundingClientRect().left)).filter((x) => x >= 0 && x < 390);
    return {scrolled: Math.round(b.scrollLeft), lefts, qLeft: q ? Math.round(q.getBoundingClientRect().left) : -1, edge: Math.round(b.getBoundingClientRect().left)};
  });
  check(al.scrolled > 0 && al.lefts.includes(al.edge) && al.lefts.includes(al.qLeft), `phone Home: after a swipe it stops in line with the tiles below (${JSON.stringify(al)})`);

  // ---- Finance › Overview (phone): the standard six ----
  await page.goto(B + '/fin'); await page.waitForTimeout(5000);
  check(JSON.stringify(await order()) === JSON.stringify(NAMES), `six tiles in their places, yesterday's saved swap ignored (${(await order()).join(' | ')})`);
  check(/^£48,000 \/ Live Contract Value \/ 2 Live Jobs$/.test(await tile(1)), `tile 1: live contract value, the live jobs as a note (${await tile(1)})`);
  check(/^£[\d,]+ \/ Still To Invoice \/ 2 Live Jobs$/.test(await tile(2)), `tile 2: still to invoice on live jobs (${await tile(2)})`);
  check(/^£1,500 \/ Owed To You \/ 2 Invoices$/.test(await tile(3)) && /^£500 \/ Overdue \/ 1 Invoice$/.test(await tile(4)), `tiles 3 and 4: owed and overdue (${await tile(3)} | ${await tile(4)})`);
  check(/^£2,940 \/ Due Out To Suppliers \/ £480 Needs Approval$/.test(await tile(5)), `tile 5: due out includes the invoices still to approve, the note says how much (not paid, statement-paid or subcontract) (${await tile(5)})`);
  check(await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Change tile "]')].filter((e) => e.parentElement.closest('button, [role="button"]')).length) === 0, 'each ⋯ is beside its tile, not inside it');
  await page.screenshot({path: path.join(SHOTS, 'overview-phone.png')});

  // ---- Each tile's own ⋯ ----
  await vis('[aria-label^="Change tile 1:"]').click(); await page.waitForTimeout(700);
  let menu = await page.evaluate(() => document.body.innerText);
  check(/Contract Value\n/.test(menu) && /✓ Live Jobs/.test(menu) && ['Upcoming Jobs', 'Closed Jobs', 'All Jobs', 'By Start Date…', 'By Client…'].every((x) => menu.includes(x)) && !/Owed To You ·|Due In The Next/.test(menu), 'tile 1\'s ⋯: live, upcoming, closed, all, by start date, by client');
  await page.screenshot({path: path.join(SHOTS, 'choose-contract-phone.png')});
  await page.getByText('All Jobs', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1500);
  check(/^£[\d,]+ \/ Total Contract Value \/ \d+ Jobs$/.test(await tile(1)) && JSON.stringify(me.fin_home_tiles) === JSON.stringify(['live_value=all']), `All Jobs: Total Contract Value, kept for the person (${await tile(1)}; ${JSON.stringify(me.fin_home_tiles)})`);
  await pick(1, 'By Client…', 'Bellway Homes');
  check(/^£48,000 \/ Contract Value · Bellway Homes \/ 1 Job$/.test(await tile(1)), `By Client: one client's contract value (${await tile(1)})`);
  await pick(2, 'Closed Jobs');
  check(/Still To Invoice · Closed \/ \d+ Closed Jobs?$/.test(await tile(2)), `tile 2 has the same choices: closed (${await tile(2)})`);

  await vis('[aria-label^="Change tile 3:"]').click(); await page.waitForTimeout(700);
  menu = await page.evaluate(() => document.body.innerText);
  check(['✓ All', 'Due In The Next 30 Days', 'Due In The Next 60 Days', 'By Due Date…', 'By Client…'].every((x) => menu.includes(x)), 'tile 3\'s ⋯: all, next 30 / 60 days, by due date, by client');
  await page.screenshot({path: path.join(SHOTS, 'choose-owed-phone.png')});
  await page.getByText('Due In The Next 30 Days', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1500);
  check(/^£1,000 \/ Owed To You · Next 30 Days \/ 1 Invoice$/.test(await tile(3)), `Owed To You, next 30 days (${await tile(3)})`);
  await pick(4, 'Over 60 Days Late');
  check(/^£0 \/ Overdue · 60\+ Days \/ 0 Invoices$/.test(await tile(4)), `Overdue over 60 days late (${await tile(4)})`);
  await pick(5, 'Past Their Due Date');
  check(/^£2,160 \/ Due Out To Suppliers · Past Due \/ 1 Invoice$/.test(await tile(5)), `Due Out past their due date (${await tile(5)})`);
  await pick(5, 'By Supplier…', 'SIG Roofing');
  check(/^£2,640 \/ Due Out To Suppliers · SIG Roofing \/ £480 Needs Approval$/.test(await tile(5)), `Due Out by supplier (${await tile(5)})`);
  check(JSON.stringify(await order()) === JSON.stringify(NAMES), 'the tiles never moved');
  await page.screenshot({path: path.join(SHOTS, 'changed-phone.png')});

  // Kept: after a reload, the same views.
  await page.reload(); await page.waitForTimeout(6000);
  check(/Contract Value · Bellway Homes/.test(await tile(1)) && /Next 30 Days/.test(await tile(3)) && /SIG Roofing/.test(await tile(5)), 'still the same after a reload');
  // Tapping Closed contract value opens the closed jobs.
  await pick(1, 'Closed Jobs');
  await vis('[aria-label^="Change tile 1:"]').evaluate((e) => e.parentElement.querySelector('[role="button"]').click()); await page.waitForTimeout(3500);
  check(new URL(page.url()).pathname === '/fin/jobs' && new URL(page.url()).searchParams.get('st') === 'closed', `tapping Closed Contract Value opens the closed jobs (${page.url().replace(B, '')})`);
  // Back to the standard views: nothing saved.
  await page.goto(B + '/fin'); await page.waitForTimeout(5000);
  for (const [n, l] of [[1, 'Live Jobs'], [2, 'Live Jobs'], [3, 'All'], [4, 'All'], [5, 'All']]) await pick(n, l);
  check(me.fin_home_tiles === null && /Live Contract Value/.test(await tile(1)), `all back to standard: nothing kept (${JSON.stringify(me.fin_home_tiles)})`);

  // ---- Laptop ----
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/fin'); await page.waitForTimeout(5000);
  const rows = await page.evaluate(() => [...new Set([...document.querySelectorAll('[aria-label^="Change tile "]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top)))].length);
  check(rows === 2 && JSON.stringify(await order()) === JSON.stringify(NAMES), `laptop: the same six in two rows of three (${rows} rows)`);
  await page.screenshot({path: path.join(SHOTS, 'overview-laptop.png'), clip: {x: 0, y: 0, width: 1300, height: 520}});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
