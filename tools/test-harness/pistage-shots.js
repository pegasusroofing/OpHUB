// Purchase invoices (Andy, 6 Nov 2026): where each one is up to (the bar on the invoice), Query With Supplier (the usual
// email pop-up with a template, to the address it came from), the PO column's ✓ / ✕ with a bubble saying why, and the
// With A PM tab filtered to one PM. Fake database only; while Finance is on trial nothing is emailed.
// node pistage-shots.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  db.profiles.push({id: 'pmA', name: 'Pat Price', role: 'pm', org_id: O, email: 'pat@x.co'}, {id: 'pmB', name: 'Sam Slate', role: 'pm', org_id: O, email: 'sam@x.co'});
  db.purchase_orders = db.purchase_orders || [];
  db.purchase_orders.push({id: 'poG', org_id: O, site_id: S1, number: 'PO-0006', supplier_name: 'SIG', value: 100, status: 'open', items: []}, {id: 'poB', org_id: O, site_id: S1, number: 'PO-0007', supplier_name: 'SIG', value: 50, status: 'open', items: []});
  db.purchase_invoices.push(
    {id: 'q1', org_id: O, site_id: S1, supplier_name: 'SIG', invoice_no: 'SIG-1', invoice_date: '2026-11-01', net: 100, vat: 20, total: 120, status: 'query', query_note: 'Price looks high', cost_code: 'materials', po_id: 'poG', lines: [{description: 'Felt', qty: 1, unit_price: 100, amount: 100, site_id: S1}]},
    {id: 'q2', org_id: O, site_id: S1, supplier_name: 'SIG', invoice_no: 'SIG-2', invoice_date: '2026-11-02', net: 60, vat: 12, total: 72, status: 'query', query_note: 'Wrong job?', cost_code: 'materials', po_id: 'poB', match_notes: '“Felt” is £60.00 each, PO-0007 says £50.00', file_path: `${O}/${S1}/purchase/sig2.pdf`, file_name: 'sig2.pdf'});
  db.messages = db.messages || [];
  db.messages.push({id: 'm1', org_id: O, kind: 'pi_query', related_id: 'q1', recipient_id: 'pmA', created_at: '2026-11-03T10:00:00Z', body: 'Query'}, {id: 'm2', org_id: O, kind: 'pi_query', related_id: 'q2', recipient_id: 'pmB', created_at: '2026-11-03T11:00:00Z', body: 'Query'});
  db.fin_inbox = db.fin_inbox || []; db.fin_inbox.push({id: 'ibq', org_id: O, status: 'filed', stage: 'filed', purchase_invoice_id: 'q2', from_email: 'accounts@sig.co.uk'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // The invoice: the bar says it's with Pat.
  await page.goto('http://localhost:8081/fin/pinv/q1'); await page.waitForTimeout(5000);
  check(await page.getByText('With Pat', {exact: true}).count() === 1, 'the bar: step 2 says With Pat');
  check(await page.getByText('Conversation With The PM (Pat Price)').count() === 1, 'the conversation is with Pat, who it was sent to');
  check(await page.getByText(/Waiting on Pat Price: “Price looks high”/).count() === 1, 'and who it’s waiting on and why');
  await page.screenshot({path: 'shots/job/pistage-query-1300.png'});

  // Query With Supplier: the usual pop-up, to the address the invoice came from.
  await page.goto('http://localhost:8081/fin/pinv/q2'); await page.waitForTimeout(5000);
  await page.getByText('Query With Supplier', {exact: true}).click(); await page.waitForTimeout(1200);
  check(await page.locator('input[value="accounts@sig.co.uk"]').count() === 1, 'Query With Supplier goes to the address it came from');
  check(await page.locator('input[value^="Query on your invoice SIG-2"]').count() === 1, 'with the template’s subject');
  await page.screenshot({path: 'shots/job/pistage-supplier-1300.png'});
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(await page.getByText(/trial/i).count() >= 1, 'nothing is emailed while Finance is on trial (it says so)');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(500);

  // The list: ✓ / ✕ by the PO, a bubble saying why, and With A PM filtered to one PM.
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices&f=pm'); await page.waitForTimeout(5000);
  const tab = page.getByRole('tab', {name: /^With A PM/}); if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(800); }
  check(await page.getByLabel('PO-0006 matches').count() === 1 && await page.getByLabel('PO-0007 doesn’t match').count() === 1, 'PO-0006 ✓ and PO-0007 ✕');
  await page.getByLabel('PO-0007 doesn’t match').click(); await page.waitForTimeout(500);
  check(await page.getByText(/PO-0007 says £50\.00/).count() >= 1, 'tapping the ✕ explains why');
  await page.screenshot({path: 'shots/job/pistage-list-1300.png'});
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(400);
  await page.getByText('PM: All', {exact: true}).first().click(); await page.waitForTimeout(500); await page.getByText('Sam Slate', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(await page.getByText('SIG-2', {exact: true}).count() === 1 && await page.getByText('SIG-1', {exact: true}).count() === 0, 'filtered to Sam: only the invoice queried with Sam');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
