// Finance › Purchases › Statements (Andy, 7 Nov 2026, laptop): the same table as everywhere, filtering in the row under
// the headings (no separate search box); a Gross After Statement Date column (the supplier's invoices dated after it);
// uploading reads the statement date and the total due, and the button says Upload Statement; once reconciled it says so
// plainly and Add A Line, Match Again and the ticks go. Fake database. node stmt-check.js
const path = require('path');
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  db.purchase_invoices = [
    {id: 'p1', org_id: O, supplier_name: 'Jewson', invoice_no: 'INV-1', invoice_date: '2026-10-05', total: 120, net: 100, status: 'approved'},
    {id: 'p2', org_id: O, supplier_name: 'Jewson', invoice_no: 'INV-2', invoice_date: '2026-11-03', total: 240, net: 200, status: 'approved'},
    {id: 'p3', org_id: O, supplier_name: 'Jewson Ltd', invoice_no: 'INV-3', invoice_date: '2026-11-05', total: 60, net: 50, status: 'to_approve'},
    {id: 'p4', org_id: O, supplier_name: 'SIG Trading Ltd', invoice_no: 'INV-501', invoice_date: '2026-10-01', total: 120, net: 100, status: 'approved'},
  ];
  db.fin_statements = [
    {id: 'st1', org_id: O, supplier_name: 'Jewson', statement_date: '2026-10-31', closing_balance: 120, status: 'open', lines: [{id: 'l1', ref: 'INV-1', amount: 120, date: '2026-10-05', type: 'invoice', match: 'p1', how: 'auto'}], created_at: '2026-11-01T09:00:00Z'},
    {id: 'st2', org_id: O, supplier_name: 'SIG Trading Ltd', statement_date: '2026-09-30', closing_balance: 0, status: 'reconciled', reconciled_at: '2026-10-02T10:00:00Z', reconciled_by: 'me', lines: [{id: 'l2', ref: 'INV-400', amount: 50, date: '2026-09-10', type: 'invoice', match: null}], created_at: '2026-10-01T09:00:00Z'},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto('http://localhost:8081/fin/statements'); await page.waitForTimeout(5000);
  let t = await page.locator('body').innerText();
  check(!(await page.getByPlaceholder('Search supplier').count()), 'no separate search box on a laptop');
  check(/GROSS AFTER STATEMENT DATE/i.test(t), 'a Gross After Statement Date column');
  check(/£300\.00/.test(t), 'Jewson: £300.00 of invoices dated after 31 Oct (INV-2 £240 + INV-3 £60)');
  check(/TOTAL DUE/i.test(t), 'the balance column says Total Due');
  await page.screenshot({path: 'shots/stmt-list.png'});

  // Upload a statement: the date and the total due are read; the button says Upload Statement.
  const fc = page.waitForEvent('filechooser'); await page.getByText('⬆ Upload Statement', {exact: true}).click();
  await (await fc).setFiles(path.join(__dirname, 'seeds', 'statement-sig.csv')); await page.waitForTimeout(4000);
  t = await page.locator('body').innerText();
  check(/New Statement/.test(t) && (await page.getByText('Upload Statement', {exact: true}).count()) > 0, 'the pop-up’s button says Upload Statement');
  check(/31 Oct 2026/.test(t), 'the statement date is read (31 Oct 2026)');
  check(await page.getByLabel('Total Due £').inputValue() === '200.5', 'the total due is read (' + await page.getByLabel('Total Due £').inputValue() + ')');
  await page.screenshot({path: 'shots/stmt-new.png'});
  await page.getByText('Upload Statement', {exact: true}).last().click(); await page.waitForTimeout(4000);
  const made = db.fin_statements.find((s) => s.id !== 'st1' && s.id !== 'st2');
  check(!!made && made.statement_date === '2026-10-31' && Number(made.closing_balance) === 200.5, 'saved with the date and total due');
  check(/[?&]id=/.test(page.url()), 'Upload Statement goes on to the statement, as before');

  // Reconciled: said plainly; nothing to change until it's reopened.
  await page.goto('http://localhost:8081/fin/statements?id=st2'); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  check(/Reconciled/.test(t) && /Reopen it to change anything/.test(t), 'a reconciled statement says so plainly');
  check(!/\+ Add A Line/.test(t) && !/Match Again/.test(t) && !/Mark Reconciled/.test(t), 'no Add A Line, Match Again or Mark Reconciled');
  check(!(await page.getByRole('checkbox', {name: /^Tick /}).count()), 'no tick boxes on the lines');
  await page.screenshot({path: 'shots/stmt-reconciled.png'});
  await page.goto('http://localhost:8081/fin/statements?id=st1'); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  check(/\+ Add A Line/.test(t) && /Mark Reconciled/.test(t), 'an open one still has its buttons');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
