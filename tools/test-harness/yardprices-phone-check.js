// Finance › Yard and Price Lists on a phone (Andy, 14 Nov 2026).
// Yard: a table of item, qty in stock, unit price and value (nothing else in the row); one row of buttons with no Return
// or Adjust; an item opens with its name at the top, its details as a plain table, and ⬇ Book In / ⬆ Book Out on one
// row: Book In is a new delivery or a return; Book Out is to a job, or lost (an admin only).
// Price Lists: one tab, no Price Book; a table of suppliers that opens the one you choose.
// Touch phone, fake database. node yardprices-phone-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
async function login(page) {
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
}
function yard(db) {
  const O = db.organizations[0].id;
  db.yard_stock = [
    {id: 'y1', org_id: O, item: 'Code 4 Lead 300mm', unit: 'roll', qty: 10, min_qty: 4, location: 'Rack B', category: 'Lead & metals', active: true},
    {id: 'y2', org_id: O, item: 'Breathable Membrane', unit: 'roll', qty: 2, min_qty: 5, location: 'Container 2', category: 'Membranes & felt', active: true},
    {id: 'y3', org_id: O, item: 'Old Tile Clips', unit: 'box', qty: 0, active: false},
  ];
  db.yard_stock_rates = [{stock_id: 'y1', org_id: O, rate: 45.5}, {stock_id: 'y2', org_id: O, rate: 60}];
  db.yard_moves = [];
}
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; yard(db);
  const O = db.organizations[0].id;
  db.fin_quotes = [{id: 'q1', org_id: O, purpose: 'pquote', site_id: null, supplier_name: 'Bauder', quote_no: '2026 Rates', quote_date: '2026-01-05', file_name: 'bauder.xlsx', created_at: '2026-01-05T09:00:00Z'}];
  db.fin_quote_items = [
    {id: 'qi1', org_id: O, quote_id: 'q1', site_id: null, active: true, supplier_name: 'Bauder', description: 'Thermofol U 15 Membrane', unit: 'm2', rate: 12.5, position: 0},
    {id: 'qi2', org_id: O, quote_id: 'q1', site_id: null, active: true, supplier_name: 'Bauder', description: 'Karat Cap Sheet', unit: 'roll', rate: 89, position: 1},
  ];
  db.fin_price_book = [
    {id: 'pb1', org_id: O, supplier_key: 'bauder', supplier_name: 'Bauder', description: 'Bauder Primer 25L', unit: 'tin', rate: 64, source: 'invoice', updated_at: '2026-10-10T09:00:00Z'},
    {id: 'pb2', org_id: O, supplier_key: 'alltype roofing', supplier_name: 'Alltype Roofing', description: 'Natural Slate 500x250', unit: 'each', rate: 1.2, source: 'quote', updated_at: '2026-09-01T09:00:00Z'},
    {id: 'pb3', org_id: O, supplier_key: 'jj roofing', supplier_name: 'JJ Roofing', description: 'Lead Code 5', unit: 'roll', rate: 140, source: 'manual', updated_at: '2026-08-01T09:00:00Z'},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await login(page);
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  // ---- Yard list ----
  await page.goto(B + '/fin/yard'); await page.waitForTimeout(5000);
  let t = await vis('[aria-label="Yard stock"]').innerText();
  check(/ITEM/.test(t) && /IN STOCK/.test(t) && /UNIT PRICE/.test(t) && /VALUE/.test(t), 'Yard: headings Item, In Stock, Unit Price, Value');
  check(/Code 4 Lead 300mm/.test(t) && /£45\.50/.test(t) && /£455\.00/.test(t) && !/Rack B/.test(t) && !/Lead & metals/.test(t) && !/min/i.test(t), 'Yard: a row is the item, qty, price and value only (no location, category or minimum)');
  check(!/Old Tile Clips/.test(t) && /In Use ▾/.test(t), 'Yard: ▾ starts on In Use (the one no longer stocked hidden)');
  check(await page.locator('[aria-label="Filter"] >> visible=true').count() === 0 && await page.locator('input[placeholder="Search item or location"] >> visible=true').count() === 0, 'Yard: no Filter, Sort or search bar');
  const ys = await Promise.all(['+ New Item', '⬇ Book In', '⬆ Book Out', 'Stock Take'].map((n) => page.getByRole('button', {name: n, exact: true}).filter({visible: true}).first().boundingBox().catch(() => null)));
  check(ys.every((b) => b && Math.abs(b.y - ys[0].y) < 2 && b.x + b.width <= 390), 'Yard: + New Item, Book In, Book Out and Stock Take on one row');
  check(!/Return from a job|Adjust a count/i.test(await body()), 'Yard: no Return or Adjust buttons');
  await page.screenshot({path: path.join(SHOTS, 'yard-list.png')});
  await page.getByText('Low Stock', {exact: true}).first().click(); await page.waitForTimeout(500);
  t = await vis('[aria-label="Yard stock"]').innerText();
  check(/Breathable Membrane/.test(t) && !/Code 4 Lead/.test(t) && /Low Stock ▾/.test(t), 'Yard: the Low Stock tile picks ▾ Low Stock');
  await page.getByLabel('Clear the column searches').first().click(); await page.waitForTimeout(400);
  await vis('[aria-label="Sort by Value"]').click(); await page.waitForTimeout(400);
  t = await vis('[aria-label="Yard stock"]').innerText();
  check(t.indexOf('Code 4 Lead') < t.indexOf('Breathable'), 'Yard: Value sorts biggest first (£455 before £120)');

  // ---- An item ----
  await vis('[aria-label="Yard stock"]').getByRole('button').filter({hasText: 'Code 4 Lead 300mm'}).first().click(); await page.waitForTimeout(2500);
  const h = await page.getByRole('heading', {name: 'Code 4 Lead 300mm'}).filter({visible: true}).count();
  check(/[?&]id=y1/.test(page.url()) && h === 1, 'Item: its name is a heading at the top');
  const d = await vis('[aria-label="Item details"]').innerText();
  check(/In The Yard\s*10 roll/.test(d) && /Minimum Level\s*4 roll/.test(d) && /Status\s*In Stock/.test(d) && /Location\s*Rack B/.test(d) && /Unit Price\s*£45\.50/.test(d) && /Stock Value\s*£455\.00/.test(d), 'Item: the details as a plain table (In The Yard, Minimum Level, Status, Location…)');
  check(!/in the yard · minimum/.test(await body()), 'Item: no "in the yard · minimum 4 · low stock" line');
  const bi = await page.getByRole('button', {name: '⬇ Book In', exact: true}).filter({visible: true}).first().boundingBox(), bo = await page.getByRole('button', {name: '⬆ Book Out', exact: true}).filter({visible: true}).first().boundingBox();
  check(bi && bo && Math.abs(bi.y - bo.y) < 2 && !/↩ Return|Adjust count/.test(await body()), 'Item: Book In and Book Out on one row; no Return or Adjust count');
  await page.screenshot({path: path.join(SHOTS, 'yard-item.png')});
  await page.getByRole('button', {name: '⬇ Book In', exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(700);
  check(await page.getByText('New Delivery', {exact: true}).filter({visible: true}).count() === 1 && await page.getByText('Returned From A Job', {exact: true}).filter({visible: true}).count() === 1, 'Book In: New Delivery or Returned From A Job');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  if (await page.getByText('New Delivery', {exact: true}).filter({visible: true}).count()) { await page.getByLabel('Close').last().click().catch(() => {}); await page.waitForTimeout(400); }
  await page.getByRole('button', {name: '⬆ Book Out', exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(700);
  check(await page.getByText('To A Job', {exact: true}).filter({visible: true}).count() === 1 && await page.getByText('Lost Or Damaged', {exact: true}).filter({visible: true}).count() === 1, 'Book Out (admin): To A Job or Lost Or Damaged');
  await page.getByText('Lost Or Damaged', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(/Book Out As Lost/.test(await body()), 'Lost: the Book Out As Lost pop-up');
  await page.getByLabel('Qty Lost', {exact: true}).fill('2');
  await page.getByLabel('What Happened (Optional)', {exact: true}).fill('Stolen from the van');
  await page.getByText('Book Out', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const mv = db.yard_moves.find((m) => m.stock_id === 'y1');
  check(mv && mv.kind === 'adjust' && Number(mv.qty) === -2 && /^Lost: Stolen/.test(mv.note || '') && !mv.site_id, 'Lost: saved as −2 marked Lost, on no job');
  t = await vis('[aria-label="Yard history"]').innerText().catch(() => '');
  check(/Booked Out As Lost/.test(t) && /Stolen from the van/.test(t), 'Item history shows Booked Out As Lost');
  await page.screenshot({path: path.join(SHOTS, 'yard-item-lost.png')});

  // ---- Price Lists ----
  await page.goto(B + '/fin/purchases?tab=prices'); await page.waitForTimeout(4500);
  check(await page.getByText('Price Book', {exact: true}).count() === 0, 'Price Lists: one tab, no Price Book');
  t = await vis('[aria-label="Price lists"]').innerText();
  check(t.indexOf('Alltype Roofing') >= 0 && t.indexOf('Alltype Roofing') < t.indexOf('Bauder') && t.indexOf('Bauder') < t.indexOf('JJ Roofing') && /1 Price List/.test(t), 'Price Lists: a table of suppliers A to Z (Alltype, Bauder, JJ)');
  await page.screenshot({path: path.join(SHOTS, 'pricelists.png')});
  await vis('[aria-label="Price lists"]').getByRole('button').filter({hasText: 'Bauder'}).first().click(); await page.waitForTimeout(2500);
  check(/sup=Bauder/.test(page.url()) && await page.getByRole('heading', {name: 'Bauder'}).filter({visible: true}).count() === 1 && /Price Lists › Bauder/.test(await body()), 'Bauder: opens with their name at the top; the trail reads Price Lists › Bauder');
  t = await vis('[aria-label="Prices"]').innerText();
  check(/Thermofol U 15 Membrane/.test(t) && /Karat Cap Sheet/.test(t) && /Bauder Primer 25L/.test(t) && /Price List/.test(t) && /Invoice/.test(t) && !/Natural Slate/.test(t), 'Bauder: their list’s items and the price from an invoice, in one table');
  const ub = await page.getByRole('button', {name: '📥 Upload Price List', exact: true}).filter({visible: true}).first().boundingBox(), ab = await page.getByRole('button', {name: '+ Add A Price', exact: true}).filter({visible: true}).first().boundingBox();
  check(ub && ab && Math.abs(ub.y - ab.y) < 2, 'Bauder: Upload Price List and Add A Price on one row');
  check(/2026 Rates/.test(await vis('[aria-label="Their price lists"]').innerText()), 'Bauder: their uploaded list shows (2026 Rates)');
  await page.screenshot({path: path.join(SHOTS, 'pricelist-bauder.png')});
  await vis('[aria-label="Search Price"]').click(); await page.waitForTimeout(500);
  await page.getByText('Picked Up', {exact: true}).last().click(); await page.waitForTimeout(500);
  t = await vis('[aria-label="Prices"]').innerText();
  check(/Bauder Primer/.test(t) && !/Thermofol/.test(t), 'Bauder: ▾ Picked Up shows only the learned price');
  await vis('[aria-label="Prices"]').getByRole('button').filter({hasText: 'Bauder Primer'}).first().click(); await page.waitForTimeout(800);
  check(/Change Price/.test(await body()), 'Bauder: tapping a learned price opens it to change');

  // ---- A PM with Finance: Book Out goes straight to a job (no Lost) ----
  const c2 = await makeContext(browser, 'pm', [], {shot: true});
  seed(c2.db); const pm = c2.db.profiles[0]; pm.finance_enabled = true; pm.howto_dismissed = ['*']; yard(c2.db);
  const p2 = await c2.ctx.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await login(p2);
  await p2.goto(B + '/fin/yard?id=y1'); await p2.waitForTimeout(5000);
  const bob = p2.getByRole('button', {name: '⬆ Book Out', exact: true}).filter({visible: true}).first();
  if (await bob.count()) {
    await bob.click(); await p2.waitForTimeout(800);
    check(await p2.getByText('Lost Or Damaged', {exact: true}).filter({visible: true}).count() === 0 && /Book Out To A Job/.test(await p2.locator('body').innerText()), 'PM: Book Out goes straight to a job; no Lost');
  } else console.log('SKIP PM: no Finance yard for a PM here (' + pm.role + ')');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
