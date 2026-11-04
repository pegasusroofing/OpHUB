// Yard decisions (4 Nov 2026), fake database:
//  - Book In with "Leftovers back from a job" saves leftover + the job (optional) and no supplier / PO;
//  - Leftovers To Allocate shows on the job's Yard Stock page and Finance › Yard stock; Credit calls yard_allocate_leftover;
//  - Stock Take saves an adjustment only for the items whose count changed.
// (The database trigger and the allocate function run on the real database only; here the call is checked.)
// node yardleft-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const out = (n) => path.join(__dirname, 'shots', 'job', `yardleft-${n}.png`);
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.yard_stock = [{id: 'y1', org_id: org, item: 'Slates', unit: 'pcs', qty: 100, active: true}, {id: 'y2', org_id: org, item: 'Gas cylinder 47kg', unit: 'nr', qty: 6, active: true}];
  db.yard_moves = [{id: 'm1', org_id: org, stock_id: 'y1', kind: 'in', qty: 12, leftover: true, alloc_status: 'pending', from_site_id: S1, created_by: db.profiles[0].id, created_at: '2026-11-04T08:00:00Z'}];
  let allocs = [];
  await ctx.route(/rest\/v1\/rpc\/yard_allocate_leftover/, async (r) => { allocs.push(JSON.parse(r.request().postData() || '{}')); const m = db.yard_moves.find((x) => x.id === 'm1'); if (m) m.alloc_status = 'done'; r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto(B + '/sites/' + S1 + '/materials/yard'); await page.waitForTimeout(4000);
  check(await page.getByText(/Leftovers To Allocate \(1\)/).count() > 0, 'job yard: leftovers panel shows');
  await page.screenshot({path: out('job-panel')});
  await page.getByText('Credit This Job', {exact: true}).click(); await page.waitForTimeout(1500);
  check(allocs.length === 1 && allocs[0].p_move === 'm1' && allocs[0].p_site === S1, 'job yard: Credit This Job allocates to this job');

  await page.goto(B + '/fin/yard'); await page.waitForTimeout(4000);
  check(await page.getByText('Stock Take', {exact: true}).count() > 0, 'finance yard: Stock Take button');
  await page.getByText('⬇ Book stock in', {exact: true}).first().click(); await page.waitForTimeout(4000);
  await page.locator('text=/^Slates/ >> visible=true').first().click(); await page.waitForTimeout(300);
  await page.getByText('Leftovers back from a job').click(); await page.waitForTimeout(300);
  check(await page.locator('input[placeholder="From (supplier)"] >> visible=true').count() === 0, 'book in: leftovers hide the supplier box');
  await page.locator('input[placeholder="Qty, e.g. 40"] >> visible=true').fill('8');
  await page.screenshot({path: out('bookin')});
  await page.locator('text="Book In" >> visible=true').click(); await page.waitForTimeout(2500);
  const mv = db.yard_moves.slice(-1)[0];
  check(mv && mv.kind === 'in' && mv.leftover === true && mv.from_site_id === null && !mv.po_id, `book in: leftover saved, job optional (${JSON.stringify({l: mv && mv.leftover, s: mv && mv.from_site_id})})`);

  await page.goto(B + '/yardcount'); await page.waitForTimeout(4000); await page.screenshot({path: out('count-open')});
  await page.fill('input[aria-label="Count for Gas cylinder 47kg"]', '4');
  await page.fill('input[aria-label="Count for Slates"]', '100');
  await page.screenshot({path: out('count')});
  const n0 = db.yard_moves.length;
  await page.getByText('Save Stock Take', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByText('Save Counts', {exact: true}).click(); await page.waitForTimeout(2500);
  const adds = db.yard_moves.slice(n0);
  check(adds.length === 1 && adds[0].kind === 'adjust' && adds[0].stock_id === 'y2' && adds[0].qty === -2, `stock take: one adjustment, -2 on the gas cylinders (${JSON.stringify(adds.map((a) => [a.stock_id, a.qty]))})`);
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
