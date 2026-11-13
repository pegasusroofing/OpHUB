// The Finance phone tables like the laptop (Andy, 14 Nov 2026: "do this for all tables in phone view"): Sales invoices and
// applications, Labour invoices, Directory clients and Estimating. Each: tap a heading to sort (money biggest first), a
// search box under each heading lined up with it, the status a ▾ choice starting where the Filter did; no Filter, Sort or
// search bar above. Touch phone, fake database. node fintables-phone-check.js   (Projects: finjobs-phone-check.js)
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
  db.fin_sub_payments = [
    {id: 'p1', org_id: O, name: 'Dan Fixer', status: 'approved', invoice_no: 'DF-7', period_start: '2026-11-02', net_pay: 800, gross: 1000, cis_deduction: 200, sub_app_id: null, lines: [{site_id: S1}], created_at: '2026-11-03T08:00:00Z'},
    {id: 'p2', org_id: O, name: 'Sam Slate', status: 'paid', invoice_no: 'SS-3', period_start: '2026-10-26', paid_on: '2026-11-01', net_pay: 600, gross: 750, cis_deduction: 150, sub_app_id: null, lines: [{site_id: S1}], created_at: '2026-10-27T08:00:00Z'},
    {id: 'p3', org_id: O, name: 'Joe Lead', status: 'approved', invoice_no: 'JL-1', period_start: '2026-11-02', net_pay: 1200, gross: 1500, cis_deduction: 300, sub_app_id: null, lines: [{site_id: S1}], created_at: '2026-11-04T08:00:00Z'},
  ];
  db.fin_clients = [...(db.fin_clients || []), {id: 'fc1', org_id: O, name: 'Bellway Homes', email: 'acc@bellway.example'}, {id: 'fc2', org_id: O, name: 'Persimmon', email: 'acc@persimmon.example', estimator_name: 'Pat Price'}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const tableText = (label) => vis(`[aria-label="${label}"]`).innerText();
  const noBars = async () => await page.locator('[aria-label="Filter"] >> visible=true').count() === 0 && await page.locator('[aria-label="Sort"] >> visible=true').count() === 0;
  // A box's writing lines up with its heading: a left one starts under it, a right one ends under it.
  const lined = (col) => page.evaluate((c) => {
    const v = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
    const b = v(`[aria-label="Search ${c}"]`), h = v(`[aria-label="Sort by ${c}"]`); if (!b || !h) return null;
    const cs = getComputedStyle(b), rb = b.getBoundingClientRect(), t = h.querySelector('div') || h, rt = t.getBoundingClientRect();
    return {left: rb.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) - rt.left, right: rb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) - rt.right};
  }, col);

  // ---- Sales › Invoices ----
  await page.goto(B + '/fin/sales?tab=invoices'); await page.waitForTimeout(5000);
  check(await noBars() && await page.locator('input[placeholder="Search invoices"]').count() === 0, 'Invoices: no Filter, Sort or search bar');
  let t = await tableText('Invoices');
  check(/Owed ▾/.test(t) && /INV-1001/.test(t) && /INV-1003/.test(t) && !/INV-1002/.test(t), 'Invoices: Gross ▾ starts on Owed (the paid one hidden)');
  const inv = await lined('Invoice'), gro = await lined('Gross');
  check(inv && Math.abs(inv.left) <= 1 && gro && Math.abs(gro.right) <= 1, `Invoices: Invoice starts under its heading, Gross ends under its (${inv && inv.left.toFixed(1)}, ${gro && gro.right.toFixed(1)})`);
  await page.screenshot({path: path.join(SHOTS, 'fin-invoices.png')});
  await vis('[aria-label="Search Gross"]').click(); await page.waitForTimeout(600);
  await page.getByText('All', {exact: true}).last().click(); await page.waitForTimeout(600);
  t = await tableText('Invoices');
  check(/INV-1002/.test(t), 'Invoices: ▾ All shows the paid one too');
  await vis('[aria-label="Sort by Gross"]').click(); await page.waitForTimeout(500);
  t = await tableText('Invoices');
  check(t.indexOf('INV-1002') < t.indexOf('INV-1001') && t.indexOf('INV-1001') < t.indexOf('INV-1003'), 'Invoices: Gross sorts biggest first');
  await vis('[aria-label="Search Invoice"]').fill('1003'); await page.waitForTimeout(500);
  t = await tableText('Invoices');
  check(/INV-1003/.test(t) && !/INV-1001/.test(t) && !/INV-1002/.test(t), 'Invoices: the Invoice box finds INV-1003');
  await page.getByLabel('Clear the column searches').first().click(); await page.waitForTimeout(500);
  t = await tableText('Invoices');
  check(/Owed ▾/.test(t) && !/INV-1002/.test(t), '✕ Clear puts it back to Owed');

  // ---- Sales › Applications ----
  await page.goto(B + '/fin/sales?tab=apps'); await page.waitForTimeout(5000);
  t = await tableText('Applications');
  check(await noBars() && /▾/.test(t) && await page.locator('[aria-label="Search Amount"] >> visible=true').count() === 1, 'Applications: a ▾ under Amount, no Filter / Sort');
  // Andy, 14 Nov: the Amount heading and its ▾ box centred in the column; the amounts stay on the right.
  const am = await page.evaluate(() => {
    const v = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
    const mid = (e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; };
    const h = v('[aria-label="Sort by Amount"]'), ht = h.querySelector('div') || h, b = v('[aria-label="Search Amount"]'), bt = b.querySelector('div') || b;
    const rng = document.createRange(); rng.selectNodeContents(ht); const hw = rng.getBoundingClientRect();
    const rng2 = document.createRange(); rng2.selectNodeContents(bt); const bw = rng2.getBoundingClientRect();
    const tbl = v('[aria-label="Applications"]'), money = [...tbl.querySelectorAll('div')].find((e) => /^£/.test(e.textContent) && !e.children.length);
    return {head: hw.left + hw.width / 2 - mid(h), box: bw.left + bw.width / 2 - mid(b), cols: mid(h) - mid(b), moneyRight: money ? tbl.getBoundingClientRect().right - money.getBoundingClientRect().right : null};
  });
  check(Math.abs(am.head) <= 1 && Math.abs(am.box) <= 1 && Math.abs(am.cols) <= 1 && am.moneyRight !== null && am.moneyRight < 14, `Applications: AMOUNT and its ▾ centred, amounts still on the right (${am.head.toFixed(1)}, ${am.box.toFixed(1)}, ${am.cols.toFixed(1)}, ${am.moneyRight && am.moneyRight.toFixed(1)})`);
  await page.screenshot({path: path.join(SHOTS, 'fin-apps.png')});

  // ---- Labour invoices ----
  await page.goto(B + '/fin/subs?tab=opinv'); await page.waitForTimeout(5000);
  t = await tableText('Labour invoices');
  check(await noBars() && /To Pay ▾/.test(t) && /Dan Fixer/.test(t) && /Joe Lead/.test(t) && !/Sam Slate/.test(t), 'Labour: Status ▾ starts on To Pay');
  await vis('[aria-label="Sort by Net"]').click(); await page.waitForTimeout(500);
  t = await tableText('Labour invoices');
  check(t.indexOf('Joe Lead') < t.indexOf('Dan Fixer'), 'Labour: Net sorts biggest first');
  await vis('[aria-label="Search Status"]').click(); await page.waitForTimeout(600);
  await page.getByText('Paid', {exact: true}).last().click(); await page.waitForTimeout(600);
  t = await tableText('Labour invoices');
  check(/Sam Slate/.test(t) && !/Dan Fixer/.test(t), 'Labour: ▾ Paid shows the paid one');
  await page.screenshot({path: path.join(SHOTS, 'fin-labour.png')});

  // ---- Directory › Clients ----
  await page.goto(B + '/fin/directory?kind=client'); await page.waitForTimeout(5000);
  check(await page.locator('input[placeholder="Search clients"] >> visible=true').count() === 0, 'Clients: no search bar above');
  await vis('[aria-label="Search Client"]').fill('bell'); await page.waitForTimeout(500);
  t = await tableText('Directory');
  check(/Bellway Homes/.test(t) && !/Persimmon/.test(t), 'Clients: the Client box finds Bellway');
  const cl = await lined('Client');
  check(cl && Math.abs(cl.left) <= 1, `Clients: the box's writing starts under CLIENT (${cl && cl.left.toFixed(1)})`);
  await page.screenshot({path: path.join(SHOTS, 'fin-clients.png')});

  // ---- Directory › Estimating ----
  await page.goto(B + '/fin/directory?kind=estimating'); await page.waitForTimeout(5000);
  check(await page.locator('input[placeholder="Search Clients"] >> visible=true').count() === 0, 'Estimating: no search bar above');
  await vis('[aria-label="Search Client"]').fill('pat'); await page.waitForTimeout(500);
  t = await tableText('Estimating');
  check(/Persimmon/.test(t) && !/Bellway/.test(t), 'Estimating: the Client box finds the estimator too');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
