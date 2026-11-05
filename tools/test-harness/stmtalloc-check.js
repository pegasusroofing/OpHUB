// Statements (Andy, 5 Nov 2026): the lines in a table with the matched invoice and project; tick, Allocate & Mark Paid
// (those invoices then show Paid (Statement)); Query With Supplier; Add Missing Invoice opens the new invoice screen
// filled in. Fake database only.
// node stmtalloc-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  db.purchase_invoices.push({id: 'piA', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'J-1', invoice_date: '2026-10-20', net: 100, vat: 20, total: 120, status: 'approved'});
  db.purchase_invoices.push({id: 'piB', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'J-2', invoice_date: '2026-10-22', net: 200, vat: 40, total: 240, status: 'approved'});
  db.fin_statements = [{id: 'st1', org_id: O, supplier_name: 'Jewson', statement_date: '2026-10-31', status: 'open', closing_balance: 410, lines: [
    {id: 'l1', ref: 'J-1', type: 'invoice', amount: 120, date: '2026-10-20', match: 'piA', how: 'auto'},
    {id: 'l2', ref: 'J-2', type: 'invoice', amount: 240, date: '2026-10-22', match: 'piB', how: 'auto'},
    {id: 'l3', ref: 'J-3', type: 'invoice', amount: 50, date: '2026-10-25'}]}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/statements?id=st1'); await page.waitForTimeout(5000);
  check(await page.getByText('Not in OpHUB').count() >= 1, 'the missing line shows Not in OpHUB');
  await page.getByLabel('Tick J-1').click(); await page.waitForTimeout(300);
  await page.getByText(/^Select All Matching/).click(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/job/stmtalloc-1300.png'});
  await page.getByText('Allocate 2 & Mark Paid').click(); await page.waitForTimeout(2000);
  const ls = db.fin_statements[0].lines;
  check(ls[0].allocated && ls[1].allocated && !ls[2].allocated, 'J-1 and J-2 allocated, J-3 not');
  check(db.fin_statements[0].status === 'open', 'the statement stays open while J-3 is missing');
  await page.getByLabel('Tick J-3').click(); await page.waitForTimeout(300);
  await page.getByText('Add Missing Invoice').click(); await page.waitForTimeout(3000);
  check(await page.getByLabel('Invoice number').inputValue() === 'J-3', 'Add Missing Invoice opens the invoice screen with J-3 filled in');
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(4000);
  await page.getByRole('tab', {name: /All Filed/}).click(); await page.waitForTimeout(800);
  check(await page.getByText('Paid (Statement)').count() === 2, 'both allocated invoices show Paid (Statement)');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
