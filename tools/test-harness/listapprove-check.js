// Purchases › Received › Actions › Approve (Andy, 6 Nov 2026): opens the invoice, saves it and approves it, with the
// action handed over in memory, not in the link (security review, 7 Nov): the same link opened on its own approves nothing.
// Fake database only (fin_inbox_file stubbed here).
// node listapprove-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  db.fin_inbox = db.fin_inbox || [];
  db.fin_inbox.push({id: 'ia1', org_id: O, site_id: S1, status: 'new', stage: 'query', received_at: new Date().toISOString(), file_name: 'a.pdf', from_email: 'a@sup.co.uk', extracted: {supplier: 'Jewson', invoice_no: 'LA-1', date: '2026-11-01', net: 100, vat: 20, total: 120, lines: [{description: 'Felt', qty: 1, unit_price: 100, amount: 100}]}},
    {id: 'ia2', org_id: O, site_id: S1, status: 'new', stage: 'query', received_at: new Date().toISOString(), file_name: 'b.pdf', from_email: 'b@sup.co.uk', extracted: {supplier: 'SIG', invoice_no: 'LA-2', date: '2026-11-01', net: 50, vat: 10, total: 60, lines: [{description: 'Tiles', qty: 1, unit_price: 50, amount: 50}]}});
  await ctx.route('**/rest/v1/rpc/fin_inbox_file', async (r) => { const b = JSON.parse(r.request().postData() || '{}'); const it = db.fin_inbox.find((x) => x.id === b.p_id); const pi = {id: 'pi-' + b.p_id, org_id: O, ...b.p_pi}; db.purchase_invoices.push(pi); it.status = 'filed'; it.purchase_invoice_id = pi.id; r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, pi})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  // The link on its own (as someone might paste it): nothing happens by itself.
  await page.goto('http://localhost:8081/fin/inbox/ia2?q=approve'); await page.waitForTimeout(5000);
  check(!db.purchase_invoices.some((p) => p.invoice_no === 'LA-2'), 'opening a link with ?q=approve saves and approves nothing');
  // From the list: Actions › Approve.
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  const t = page.getByRole('tab', {name: /^Received/}); if (await t.count()) { await t.first().click(); await page.waitForTimeout(600); }
  const row = page.locator('[testid="col-a"], [data-testid="col-a"]');
  const acts = page.getByLabel('Actions', {exact: true});
  // The row for LA-1: its Actions box is in the same row as the text LA-1.
  const n = await acts.count(); let done = false;
  for (let i = 0; i < n && !done; i++) {
    const box = await acts.nth(i).boundingBox(), la = await page.getByText('LA-1', {exact: true}).boundingBox();
    if (box && la && Math.abs(box.y + box.height / 2 - (la.y + la.height / 2)) < 20) { await acts.nth(i).click(); await page.waitForTimeout(300); await page.getByText('Approve', {exact: true}).last().click(); done = true; }
  }
  await page.waitForTimeout(6000);
  const pi = db.purchase_invoices.find((p) => p.invoice_no === 'LA-1');
  check(!!pi && pi.status === 'approved', 'Actions › Approve on the list saves it and approves it (' + (pi && pi.status) + ')');
  check(!/\?q=/.test(page.url()), 'and nothing rides in the link (' + new URL(page.url()).pathname + new URL(page.url()).search + ')');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
