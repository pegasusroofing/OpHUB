// Purchase invoices (Andy, 5 Nov 2026; 6 Nov: tabs Received / With A PM / Needs Checking / Approved / All, paid ones
// stay under Approved with their status Paid);
// Status says Paid (Statement) when the invoice is on a reconciled supplier statement; no Select All until one is
// ticked, then a bulk edit bar under the list (Approve, Change VAT, Change Cost Type, Mark Paid). Fake database only.
// node pinvlist-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  db.purchase_invoices.push({id: 'piA', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'J-1', invoice_date: '2026-10-20', net: 100, vat: 20, total: 120, status: 'approved', cost_code: 'materials'});
  db.purchase_invoices.push({id: 'piB', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'J-2', invoice_date: '2026-10-21', net: 200, vat: 40, total: 240, status: 'approved', auto_approved: true, cost_code: 'materials'});
  db.fin_statements = db.fin_statements || [];
  db.fin_statements.push({id: 'st1', org_id: O, supplier_name: 'Jewson', statement_date: '2026-10-31', status: 'reconciled', lines: [{id: 'l1', ref: 'J-1', type: 'invoice', amount: 120, match: 'piA', how: 'auto'}]});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check(['Received', 'With A PM', 'Needs Checking', 'Approved'].every((n) => tabs.some((t) => t.startsWith(n))), 'tabs: ' + tabs.slice(-6).join(' · '));
  await page.getByRole('tab', {name: /^All/}).click(); await page.waitForTimeout(800);
  check(await page.getByText('Paid (Statement)').count() === 1, 'J-1 shows Paid (Statement)');
  check(await page.getByText('Approved (Auto)').count() === 1, 'J-2 shows Approved (Auto)');
  check(await page.getByText(/^Select All/).count() === 0, 'no Select All before anything is ticked');
  await page.getByRole('tab', {name: /^Approved/}).click(); await page.waitForTimeout(800);
  check(await page.getByText('J-1', {exact: true}).count() === 1 && await page.getByText('J-2', {exact: true}).count() === 1 && await page.getByText(/^Paid/).count() >= 1, 'Approved has J-1 (status Paid, on its statement) and J-2');
  check(await page.getByText('Xero', {exact: true}).count() >= 1 && await page.getByText(/^Not Posted/).count() >= 1, 'Approved shows a Xero column (Not Posted while on trial)');
  await page.screenshot({path: 'shots/job/pinvlist-approved-1300.png'});
  await page.getByRole('checkbox').first().click(); await page.waitForTimeout(500);
  for (const b of ['Change VAT', 'Change Cost Type']) check(await page.getByText(b, {exact: true}).count() === 1, `bulk bar has ${b}`);
  check(await page.getByText(/^Mark 1 Paid$/).count() === 1, 'bulk bar has Mark 1 Paid');
  await page.getByText('Change Cost Type', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('Plant', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(db.purchase_invoices.find((i) => i.id === 'piB').cost_code === 'plant', 'cost type changed in bulk');
  await page.getByRole('tab', {name: /^All/}).click(); await page.waitForTimeout(600);
  await page.getByRole('checkbox').first().click(); await page.waitForTimeout(500);
  await page.screenshot({path: 'shots/job/pinvlist-1300.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
