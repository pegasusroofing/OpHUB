// Purchase invoices, Received tab as a table (Andy, 6 Nov 2026): supplier first, invoice no., date, gross, why it's
// waiting in a few words, and the next step (Choose Job / Send To PM, or Fill It In / Not An Invoice). Also the invoice
// screen's buttons on one row beside the PDF, with Save & Query Supplier on a new invoice. Fake database only.
// node recv-shots.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id;
  db.fin_inbox = db.fin_inbox || [];
  db.fin_inbox.push({id: 'r1', org_id: O, status: 'new', stage: 'query', received_at: new Date(Date.now() - 5 * 864e5).toISOString(), file_name: 'zza-lost.png', from_email: 'accounts@zzreader.co.uk', query_reason: 'Couldn’t tell which job it’s for', extracted: {supplier: 'ZZ Reader Roofing Ltd', invoice_no: 'RR-1182', date: '2026-10-28', total: 360, vat: 60, net: 300, lines: [{description: 'ZZ reader felt roll', qty: 5, unit_price: 40, amount: 200}, {description: 'Screws', qty: 1, unit_price: 100, amount: 100}]}},
    {id: 'r2', org_id: O, status: 'new', stage: 'query', received_at: new Date().toISOString(), file_name: 'scan.pdf', from_email: 'sig@sig.co.uk', query_reason: 'Couldn’t read it: Reader error'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  const t = page.getByRole('tab', {name: /^Received/}); if (await t.count()) { await t.first().click(); await page.waitForTimeout(800); }
  check(await page.getByText('ZZ Reader Roofing Ltd', {exact: true}).count() === 1 && await page.getByText('zza-lost.png').count() === 0, 'the supplier leads, not the file name');
  check(await page.getByText('RR-1182', {exact: true}).count() === 1, 'the invoice number shows');
  check(await page.getByText('Which job? Not on the invoice').count() >= 1 && await page.getByText('Couldn’t read it', {exact: true}).count() === 1, 'why each is waiting, in a few words');
  check(await page.getByText('Choose Job', {exact: true}).count() >= 1 && await page.getByText('Fill It In', {exact: true}).count() === 1, 'the next step: Choose Job, or Fill It In');
  await page.screenshot({path: 'shots/job/recv-1300.png'});
  // The invoice screen beside its PDF: every button on one row.
  await page.goto('http://localhost:8081/fin/inbox/r1'); await page.waitForTimeout(5000);
  const ys = []; for (const n of ['Not An Invoice', 'Save & Query To PM', 'Save & Query Supplier', 'Save', 'Approve Invoice']) { const b = await page.getByText(n, {exact: true}).last().boundingBox(); ys.push(b ? Math.round(b.y) : -1); }
  check(ys.every((v) => v > 0 && Math.abs(v - ys[0]) < 3), 'the invoice buttons are on one row ' + ys.join(','));
  await page.screenshot({path: 'shots/job/recv-invoice-1300.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
