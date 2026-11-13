// Finance › Purchases on a phone (Andy, 14 Nov 2026): it opens on Purchase Invoices, not Purchase Orders; and Purchase
// Orders is a table like the rest of Finance: tap a heading to sort (Value biggest first), a search box under each
// heading lined up with it, the status a ▾ under Value starting on Open; no Filter, Sort or search bar above.
// Touch phone, fake database. node purchases-phone-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S1 = db.sites[0].id;
  db.purchase_orders.push(
    {id: 'po2', org_id: O, site_id: S1, number: 'J101-PO-002', supplier_name: 'Travis Perkins', status: 'open', value: 4200, total: 4200, items: [], created_at: '2026-10-20T09:00:00Z'},
    {id: 'po3', org_id: O, site_id: S1, number: 'J101-PO-003', supplier_name: 'Jewson', status: 'invoiced', value: 9900, total: 9900, items: [], created_at: '2026-10-25T09:00:00Z'},
    {id: 'po4', org_id: O, site_id: S1, number: 'J101-PO-004', supplier_name: 'Marley', status: 'cancelled', value: 300, total: 300, items: [], created_at: '2026-10-28T09:00:00Z'},
  );
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const tableText = () => vis('[aria-label="Purchase orders"]').innerText();

  // ---- Purchases opens on Purchase Invoices ----
  await page.goto(B + '/fin/purchases'); await page.waitForTimeout(5000);
  check(await page.getByText(/Each invoice goes Received/).filter({visible: true}).count() === 1 && await page.locator('[aria-label="Purchase orders"] >> visible=true').count() === 0, 'Purchases opens on Purchase Invoices');

  // ---- Purchase Orders ----
  await page.goto(B + '/fin/purchases?tab=orders'); await page.waitForTimeout(5000);
  check(await page.locator('[aria-label="Filter"] >> visible=true').count() === 0 && await page.locator('[aria-label="Sort"] >> visible=true').count() === 0 && await page.locator('input[placeholder="Search PO, supplier or project"] >> visible=true').count() === 0, 'Orders: no Filter, Sort or search bar');
  const nb = await page.getByRole('button', {name: '+ New PO', exact: true}).filter({visible: true}).boundingBox().catch(() => null);
  check(nb && nb.width > 330, `+ New PO is full width above the table, not beside the tabs (${nb && Math.round(nb.width)})`);
  const cut = await page.evaluate(() => { const t = [...document.querySelectorAll('[aria-label="Purchase orders"] div')].find((e) => e.textContent === 'J101-PO-002' && !e.children.length); return t ? t.scrollWidth - t.clientWidth : null; });
  check(cut === 0, `the PO number shows in full (${cut})`);
  let t = await tableText();
  check(/Open ▾/.test(t) && /SIG Roofing/.test(t) && /Travis Perkins/.test(t) && !/Jewson/.test(t) && !/Marley/.test(t), 'Orders: ▾ starts on Open (invoiced and cancelled hidden)');
  check(/£4,200 Left/.test(t) && /J101 · /.test(t) || /J101/.test(t), 'Orders: each row shows the project and what is left to invoice');
  const lined = await page.evaluate(() => {
    const v = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
    const out = {};
    for (const c of ['PO', 'Supplier', 'Value']) {
      const b = v(`[aria-label="Search ${c}"]`), h = v(`[aria-label="Sort by ${c}"]`); const cs = getComputedStyle(b), rb = b.getBoundingClientRect(), rt = (h.querySelector('div') || h).getBoundingClientRect();
      out[c] = {left: rb.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) - rt.left, right: rb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) - rt.right};
    }
    return out;
  });
  check(Math.abs(lined.PO.left) <= 1 && Math.abs(lined.Supplier.left) <= 1 && Math.abs(lined.Value.right) <= 1, `Orders: the boxes line up with their headings (${lined.PO.left.toFixed(1)}, ${lined.Supplier.left.toFixed(1)}, ${lined.Value.right.toFixed(1)})`);
  await page.screenshot({path: path.join(SHOTS, 'fin-pos.png')});
  await vis('[aria-label="Search Value"]').click(); await page.waitForTimeout(600);
  await page.getByText('All', {exact: true}).last().click(); await page.waitForTimeout(600);
  t = await tableText();
  check(/Jewson/.test(t) && /Marley/.test(t) && /Invoiced/.test(t) && /Cancelled/.test(t), 'Orders: ▾ All shows the invoiced and cancelled ones');
  await vis('[aria-label="Sort by Value"]').click(); await page.waitForTimeout(500);
  t = await tableText();
  check(t.indexOf('Jewson') < t.indexOf('Travis Perkins') && t.indexOf('Travis Perkins') < t.indexOf('SIG Roofing') && t.indexOf('SIG Roofing') < t.indexOf('Marley'), 'Orders: Value sorts biggest first');
  await vis('[aria-label="Search Supplier"]').fill('travis'); await page.waitForTimeout(500);
  t = await tableText();
  check(/Travis Perkins/.test(t) && !/SIG Roofing/.test(t) && !/Jewson/.test(t), 'Orders: the Supplier box finds Travis Perkins');
  await vis('[aria-label="Search PO"]').fill(''); await vis('[aria-label="Search Supplier"]').fill(''); await page.waitForTimeout(300);
  await vis('[aria-label="Search PO"]').fill('003'); await page.waitForTimeout(500);
  t = await tableText();
  check(/Jewson/.test(t) && !/Travis Perkins/.test(t), 'Orders: the PO box finds J101-PO-003');
  await page.getByLabel('Clear the column searches').first().click(); await page.waitForTimeout(500);
  t = await tableText();
  check(/Open ▾/.test(t) && !/Jewson/.test(t), '✕ Clear puts it back to Open');
  await vis('[aria-label="Purchase orders"]').getByRole('button').filter({hasText: 'SIG Roofing'}).first().click();
  await page.waitForTimeout(3000);
  check(/\/fin\/po\/po1/.test(page.url()), 'Orders: tapping a row opens the PO');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
