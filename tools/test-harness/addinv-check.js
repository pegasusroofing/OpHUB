// Add Invoices (Andy, 7 Nov 2026): one page. Choose (or drop) several files: each becomes its own invoice in Received and is
// listed, tap one to open it; one file: Type It In Now opens it beside its PDF. Fake database only.
// node addinv-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  db.fin_inbox = db.fin_inbox || []; const before = db.fin_inbox.length;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(4500);
  check(await page.getByText('Add Manually', {exact: true}).count() === 0, 'one Add Invoices button (no separate Add Manually)');
  await page.getByText('Add Invoices', {exact: true}).click(); await page.waitForTimeout(2500);
  check(new URL(page.url()).pathname === '/fin/pinv/add', 'it opens the Add Invoices page');
  const S = path.join(__dirname, 'shots', 'samples');
  let fc = page.waitForEvent('filechooser'); await page.getByLabel('Choose invoice files').click(); await (await fc).setFiles([path.join(S, 'sample.pdf'), path.join(S, 'wo.pdf')]); await page.waitForTimeout(3500);
  check(db.fin_inbox.length === before + 2, 'two files: two invoices in Received (' + (db.fin_inbox.length - before) + ')');
  check(await page.getByText('Added (2)').count() === 1 && await page.getByText('sample.pdf').count() >= 1 && await page.getByText('wo.pdf').count() >= 1, 'listed, each to open');
  await page.screenshot({path: 'shots/job/addinv-1300.png'});
  await page.locator('text=wo.pdf >> visible=true').first().click(); await page.waitForTimeout(3000);
  check(/^\/fin\/inbox\//.test(new URL(page.url()).pathname), 'tapping one opens it to process (' + new URL(page.url()).pathname + ')');
  // One file: Type It In Now.
  await page.goto('http://localhost:8081/fin/pinv/add'); await page.waitForTimeout(3000);
  fc = page.waitForEvent('filechooser'); await page.getByLabel('Choose invoice files').click(); await (await fc).setFiles([path.join(S, 'sample.pdf')]); await page.waitForTimeout(3000);
  check(await page.getByText('Type It In Now', {exact: true}).count() === 1, 'one file: Type It In Now');
  await page.getByText('Type It In Now', {exact: true}).click(); await page.waitForTimeout(3500);
  check(/^\/fin\/inbox\//.test(new URL(page.url()).pathname) && await page.getByLabel('Line 1 description').count() === 1, 'which opens the invoice form with its file');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
