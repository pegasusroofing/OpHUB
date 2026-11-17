// Finance › Overview's tiles (Andy, 17 Nov 2026: "Can we have the tiles in finance Home Screen customisable with an
// ellipsis? I want what's owed out as a tile so not sure if we can move qty of jobs as a note to the 1st tile? Then put
// money due out as the 5th tile (this pulls through the total due out to manufacturers only)"). The standard six with
// the live jobs as a note on the first and Due Out To Suppliers fifth (approved, unpaid supplier invoices incl. VAT; not
// paid ones, not ones paid on a statement, not subcontract ones; still-being-checked ones as a note); each tile's ⋯
// chooses what it shows, swapping with the tile that showed it, kept for the person; Back To The Standard Tiles.
// Also Home's Today row on a phone snaps to the tiles' edges ("the spacing between the weather and who's on site ...
// looks out of align"). Phone, then laptop. Fake database. node fintiles17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'fintiles17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*'], fin_home_tiles: null});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const O = db.organizations[0].id;
  db.job_finance = [{site_id: S1, org_id: O, billing_type: 'invoice', contract_value: 48000}];
  db.purchase_invoices = [
    {id: 'pi1', org_id: O, site_id: S1, supplier_name: 'SIG Roofing', invoice_no: 'A1', invoice_date: '2026-11-01', net: 1800, vat: 360, total: 2160, status: 'approved', created_at: '2026-11-01T09:00:00Z'},
    {id: 'pi2', org_id: O, site_id: S1, supplier_name: 'SIG Roofing', invoice_no: 'A2', invoice_date: '2026-11-02', net: 400, vat: 80, total: 480, status: 'to_approve', created_at: '2026-11-02T09:00:00Z'},
    {id: 'pi3', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'B1', invoice_date: '2026-10-02', net: 1000, vat: 200, total: 1200, status: 'approved', paid_on: '2026-11-03', created_at: '2026-10-02T09:00:00Z'},
    {id: 'pi4', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'B2', invoice_date: '2026-10-05', net: 500, vat: 100, total: 600, status: 'approved', created_at: '2026-10-05T09:00:00Z'},
    {id: 'pi5', org_id: O, site_id: S1, supplier_name: 'Ace Subbies', invoice_no: 'S1', invoice_date: '2026-11-05', net: 9000, vat: 0, total: 9000, status: 'approved', sub_job_id: 'sj1', created_at: '2026-11-05T09:00:00Z'},
  ];
  db.fin_statements = [{id: 'st1', org_id: O, supplier_name: 'Jewson', status: 'reconciled', statement_date: '2026-10-31', lines: [{id: 'l1', type: 'invoice', amount: 600, match: 'pi4'}]}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (/cannot contain a nested|cannot be a descendant/.test(m.text())) errs.push(m.text().slice(0, 90)); });
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  // The six tiles' labels in order, by their ⋯ buttons.
  const order = () => page.evaluate(() => [...document.querySelectorAll('[aria-label^="Change tile "]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label').replace(/^Change tile \d+: /, '')));
  const tileText = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('[aria-label^="Change tile "]')].find((e) => e.getAttribute('aria-label').endsWith(`: ${l}`) && e.getBoundingClientRect().width > 0); return b ? b.parentElement.innerText : ''; }, label);
  const pick = async (slot, label) => { await vis(`[aria-label^="Change tile ${slot}:"]`).click(); await page.waitForTimeout(700); await page.getByText(label, {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1500); };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // ---- Home's Today row (phone) ----
  await page.goto(B + '/home'); await page.waitForTimeout(5000);
  const snap = await page.evaluate(() => { const b = document.querySelector('[data-testid="today-bar"]'); const kid = b && b.querySelector(':scope > div > div'); return {type: b ? getComputedStyle(b).scrollSnapType : '', align: kid ? getComputedStyle(kid).scrollSnapAlign : ''}; });
  check(/x mandatory/.test(snap.type) && /start/.test(snap.align), `phone Home: the Today row snaps to each tile's edge (${snap.type} / ${snap.align})`);
  const bar = await vis('[data-testid="today-bar"]').boundingBox();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2); await page.mouse.wheel(70, 0); await page.waitForTimeout(1200);
  const al = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="today-bar"]'); const leaf = (t) => [...document.querySelectorAll('div[dir="auto"]')].find((e) => e.textContent.trim() === t && e.getBoundingClientRect().width > 0);
    let q = leaf('Quotes'); while (q && getComputedStyle(q).borderTopWidth === '0px') q = q.parentElement;
    const lefts = [...b.querySelectorAll(':scope > div > div')].map((e) => Math.round(e.getBoundingClientRect().left)).filter((x) => x >= 0 && x < 390);
    return {scrolled: Math.round(b.scrollLeft), lefts, qLeft: q ? Math.round(q.getBoundingClientRect().left) : -1, edge: Math.round(b.getBoundingClientRect().left)};
  });
  check(al.scrolled > 0 && al.lefts.includes(al.edge) && al.lefts.includes(al.qLeft), `phone Home: after a swipe it stops in line with the tiles below (${JSON.stringify(al)})`);

  // ---- Finance › Overview (phone) ----
  await page.goto(B + '/fin'); await page.waitForTimeout(5000);
  check(JSON.stringify(await order()) === JSON.stringify(['Live Contract Value', 'Still To Invoice', 'Owed To You', 'Overdue', 'Due Out To Suppliers', 'Retention Held By Clients']), `standard six, Due Out To Suppliers fifth (${(await order()).join(' | ')})`);
  check(/£48,000\s+Live Contract Value\s+2 Live Jobs\b/.test(await tileText('Live Contract Value')), `the live jobs are a note on the first tile (${(await tileText('Live Contract Value')).replace(/\n/g, ' / ')})`);
  const due = await tileText('Due Out To Suppliers');
  check(/^£2,160\b/.test(due) && /Plus £480 To Check/.test(due), `Due Out: approved and unpaid only (not paid, not on a reconciled statement, not subcontract), still-checking as a note (${due.replace(/\n/g, ' / ')})`);
  check(await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Change tile "]')].filter((e) => e.parentElement.closest('button, [role="button"]')).length) === 0, 'each ⋯ is beside its tile, not inside it');
  await page.screenshot({path: path.join(SHOTS, 'overview-phone.png')});

  // ⋯ on tile 2: the choices.
  await vis('[aria-label^="Change tile 2:"]').click(); await page.waitForTimeout(700);
  const menu = await page.evaluate(() => document.body.innerText);
  check(/Show On Tile 2/.test(menu) && /✓ Still To Invoice/.test(menu) && /Total Live Jobs/.test(menu) && /Due Out To Suppliers · On Tile 5/.test(menu) && !/Back To The Standard Tiles/.test(menu), 'tile 2\'s ⋯: what it can show, ✓ the one it shows, where the others are');
  await page.screenshot({path: path.join(SHOTS, 'choose-phone.png')});
  await page.getByText('Total Live Jobs', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1500);
  check((await order())[1] === 'Total Live Jobs' && JSON.stringify(me.fin_home_tiles) === JSON.stringify(['live_value', 'live_jobs', 'owed', 'overdue', 'due_out', 'ret_held']), `choosing Total Live Jobs puts it on tile 2, kept for the person (${JSON.stringify(me.fin_home_tiles)})`);
  await pick(1, 'Due Out To Suppliers · On Tile 5');
  let o = await order();
  check(o[0] === 'Due Out To Suppliers' && o[4] === 'Live Contract Value', `choosing one already shown swaps the two (${o.join(' | ')})`);
  await page.reload(); await page.waitForTimeout(6000);
  o = await order();
  check(o[0] === 'Due Out To Suppliers' && o[1] === 'Total Live Jobs', 'still there after a reload');
  await pick(3, 'Back To The Standard Tiles');
  check((await order())[4] === 'Due Out To Suppliers' && me.fin_home_tiles === null, `Back To The Standard Tiles (${JSON.stringify(me.fin_home_tiles)})`);

  // Tapping Due Out opens the approved, unpaid supplier invoices.
  await vis('[aria-label^="Change tile 5:"]').evaluate((e) => e.parentElement.querySelector('[role="button"]').click()); await page.waitForTimeout(3500);
  const u = new URL(page.url());
  check(u.pathname === '/fin/purchases' && u.searchParams.get('tab') === 'invoices' && u.searchParams.get('f') === 'unpaid', `tapping Due Out opens Purchases › Invoices › Approved (${u.pathname}${u.search})`);
  const pt = await page.evaluate(() => document.body.innerText);
  check(/£2,160/.test(pt) && /To Pay Suppliers/.test(pt), 'Purchases\' To Pay Suppliers says the same £2,160 (one rule for both)');

  // ---- Laptop ----
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/fin'); await page.waitForTimeout(5000);
  const rows = await page.evaluate(() => [...new Set([...document.querySelectorAll('[aria-label^="Change tile "]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top)))].length);
  check(rows === 2 && (await order()).length === 6, `laptop: six tiles in two rows of three (${rows} rows)`);
  await page.screenshot({path: path.join(SHOTS, 'overview-laptop.png'), clip: {x: 0, y: 0, width: 1300, height: 520}});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
