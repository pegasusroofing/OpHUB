// Andy's second laptop list of 14 Nov 2026 (on the beta), 1300-wide laptop, fake database: Yard › Stock with Book In /
// Book Out on each row, + New Item across the page, Stock Take beside the Stock / Plant tabs and no search bar or filters;
// Yard › Plant as the same kind of table; Price Lists in the laptop's Finance table; back in Finance going to the tab you
// were on; Retention with Date Of PC, Total Retention and Released; a draft invoice's empty boxes typed into straight
// after Tab, its Save / Issue / Delete row inside the page's edges; the Export footer's words inside the page's edges.
// node laptop14b-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
// OneDrive can briefly lock a screenshot it is still syncing; a missed picture is not a failed check.
let page; const snap = (o) => page.screenshot(o).catch((e) => console.log('screenshot skipped: ' + String(e.message).slice(0, 120)));
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S1 = db.sites[0].id, S2 = db.sites[1] ? db.sites[1].id : S1;
  db.yard_stock = [{id: 'y1', org_id: O, item: 'Code 4 Lead', unit: 'roll', qty: 10, min_qty: 2, active: true, category: 'Lead & metals'}, {id: 'y2', org_id: O, item: 'Ridge Tiles', unit: 'each', qty: 75, active: true}];
  db.yard_stock_rates = [{stock_id: 'y1', org_id: O, rate: 45.5}, {stock_id: 'y2', org_id: O, rate: 4.2}];
  db.fin_price_book = [{id: 'pb1', org_id: O, supplier_key: 'bauder', supplier_name: 'Bauder', description: 'Bauder Primer 25L', unit: 'tin', rate: 64, source: 'invoice', updated_at: '2026-10-10T09:00:00Z'}];
  // Retention: 5% held on two certificates; half released by invoice; the job closed with no PC date.
  db.fin_applications = [
    {id: 'ra1', org_id: O, site_id: S1, number: 1, status: 'certified', valuation_date: '2026-08-31', cert_date: '2026-09-10', cert_gross: 20000, cert_net: 19000, cert_retention: 1000},
    {id: 'ra2', org_id: O, site_id: S1, number: 2, status: 'certified', valuation_date: '2026-09-30', cert_date: '2026-10-10', cert_gross: 40000, cert_net: 38000, cert_retention: 2000},
  ];
  db.fin_invoices = (db.fin_invoices || []).concat([
    // The job's final invoice (20 Oct), then its retention release (2 Nov): Date Of PC comes from the final invoice, never
    // the retention release (review, 15 Nov 2026).
    {id: 'finv1', org_id: O, site_id: S1, number: 'INV-899', status: 'paid', issue_date: '2026-10-20', net: 5000, vat: 0, total: 5000, paid: 5000, lines: [], created_at: '2026-10-20T08:00:00Z'},
    {id: 'rinv1', org_id: O, site_id: S1, number: 'INV-900', status: 'issued', issue_date: '2026-11-02', net: 1000, vat: 0, total: 1000, paid: 0, lines: [], created_at: '2026-11-02T09:00:00Z'},
    {id: 'dinv1', org_id: O, site_id: S1, number: null, status: 'draft', issue_date: '2026-11-14', net: 0, vat: 0, total: 0, lines: [], bill_name: null, bill_address: null, bill_email: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
  ]);
  db.job_finance = (db.job_finance || []).filter((j) => j.site_id !== S1).concat([{id: 'jf1', org_id: O, site_id: S1, billing_type: 'application', ret1_invoice_id: 'rinv1'}]);
  db.sites.find((s) => s.id === S1).status = 'closed';
  page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const body = () => page.locator('body').innerText();

  // ---- Yard › Stock ----
  await page.goto(B + '/fin/yard'); await page.waitForTimeout(5000);
  let t = await body();
  check(!/Search item or location/.test(t) && !/Filter: In use/.test(t), 'yard: no search bar or filters above the table');
  const inBtns = await page.getByText('⬇ Book In', {exact: true}).filter({visible: true}).count(), outBtns = await page.getByText('⬆ Book Out', {exact: true}).filter({visible: true}).count();
  check(inBtns === 2 && outBtns === 2, `yard: Book In / Book Out on each row (${inBtns}, ${outBtns})`);
  const nb = await page.getByText('+ New Item', {exact: true}).filter({visible: true}).first().locator('..').boundingBox();
  check(!!nb && nb.width > 800, `yard: + New Item across the page (${nb && Math.round(nb.width)})`);
  const st = await page.getByText('Stock Take', {exact: true}).filter({visible: true}).first().boundingBox();
  const tab = await page.getByText('Stock', {exact: true}).filter({visible: true}).first().boundingBox();
  check(!!st && !!tab && Math.abs((st.y + st.height / 2) - (tab.y + tab.height / 2)) < 8 && st.x > 1000, 'yard: Stock Take on the right of the Stock / Plant row');
  await snap({path: path.join(SHOTS, 'laptop-yard2.png')});
  await page.getByText('⬆ Book Out', {exact: true}).filter({visible: true}).nth(1).click(); await page.waitForTimeout(800);
  await page.getByText('To A Job', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Book Out To A Job/.test(t) && /Ridge Tiles: 75/.test(t), 'yard: a row\'s Book Out opens the form for that item');
  await snap({path: path.join(SHOTS, 'laptop-yard-bookout.png')});
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- Yard › Plant ----
  db.plant_items = db.plant_items || [];
  await page.goto(B + '/fin/yard?sub=plant'); await page.waitForTimeout(4500);
  t = await body();
  const ap = await page.getByText('+ Add Plant', {exact: true}).filter({visible: true}).first().locator('..').boundingBox().catch(() => null);
  check(!!ap && ap.width > 800 && !/Search item, number, person or job/.test(t), `plant: + Add Plant across the page, no search bar (${ap && Math.round(ap.width)})`);
  await snap({path: path.join(SHOTS, 'laptop-plant.png')});

  // ---- Price Lists ----
  await page.goto(B + '/fin/purchases?tab=prices'); await page.waitForTimeout(4500);
  check(await page.locator('[aria-label="Price lists"] >> visible=true').count() === 0 && /Bauder/.test(await body()) && /PRICE LISTS|Price Lists/.test(await body()), 'price lists: the laptop table (not the phone one)');
  await snap({path: path.join(SHOTS, 'laptop-pricelists2.png')});

  // ---- Back goes up a level; a tab isn't a level (Andy, 18 Nov, replacing 14 Nov's "back to the tab you were on") ----
  await page.goto(B + '/fin/purchases?tab=invoices'); await page.waitForTimeout(4000);
  await page.getByText('Purchase Orders', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(2500);
  await page.getByText('Plant Hire', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(2500);
  await page.locator('[aria-label="Back"] >> visible=true').first().click(); await page.waitForTimeout(2500);
  check(/\/fin(\?|$)/.test(page.url()), `back: from a Purchases tab up to Finance, not the tab before (${page.url().split('8081')[1]})`);

  // ---- Retention ----
  await page.goto(B + '/fin/sales?tab=retention'); await page.waitForTimeout(5000);
  t = await body();
  check(/Date Of PC/i.test(t) && /Retention/i.test(t) && /Released/i.test(t), 'retention: Date Of PC, Retention and Released columns');
  check(/£2,000\.00/.test(t) && /£1,000\.00/.test(t) && /20 Oct 2026 \(Final Invoice\)/.test(t), 'retention: total £2,000, released £1,000, PC date from the final invoice on a closed job');
  await snap({path: path.join(SHOTS, 'laptop-retention.png')});

  // ---- Draft invoice: Tab into an empty box and type ----
  await page.goto(B + `/fin/job/${S1}/invoice/dinv1`); await page.waitForTimeout(5000);
  const billTo = page.locator('input[aria-label="Bill to"] >> visible=true').first();
  check(await billTo.count() === 1, 'invoice: an empty Bill To is a box to type in');
  await billTo.click(); await page.keyboard.type('Bellway Homes'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  await page.keyboard.type('1 High Street'); await page.waitForTimeout(300);
  t = await body();
  const addr = await page.locator('textarea[aria-label="Billing address"] >> visible=true').first().inputValue().catch(() => '');
  check(/Bellway Homes/.test(t) && addr === '1 High Street', `invoice: Tab goes to the address and you can type (${addr})`);
  const bar = await page.getByText('Issue Invoice', {exact: true}).filter({visible: true}).first().boundingBox();
  const save = await page.getByText('Save Draft', {exact: true}).filter({visible: true}).first().locator('..').boundingBox();
  check(!!save && save.x >= 248 + 40 - 2, `invoice: Save / Issue / Delete inside the page's edges (${save && Math.round(save.x)})`);
  await snap({path: path.join(SHOTS, 'laptop-invoice-draft.png')});

  // ---- Export footer words inside the page's edges (Reports: full width under the page) ----
  await page.goto(B + `/fin/job/${S1}/costs`); await page.waitForTimeout(4500);
  const ex = await page.getByText('Export To Excel', {exact: true}).filter({visible: true}).first().boundingBox().catch(() => null);
  check(!ex || ex.x >= 248 + 40 - 2, `export footer: "Export To Excel" starts at the page's edge, not in the grey (${ex && Math.round(ex.x)})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
