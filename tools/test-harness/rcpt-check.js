// Expense receipts go to Finance (Andy, 7 Nov 2026): a receipt sent in from a job is an item in Purchase Invoices ›
// Received, for the Finance person chosen in Finance Settings. It says "Receipt For <name>", opens with the receipt photo
// (from site-photos, where it was sent), a note of who sent it, and a line ready for the amount; saved, it's a receipt.
// Fake database only (fin_inbox_file stubbed here).
// node rcpt-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S1 = db.sites[0].id;
  db.sites[0].job_number = 'J201';
  db.profiles.push({id: 'fp1', org_id: O, name: 'Fiona Books', role: 'admin', finance_enabled: true, email: 'f@x.co'});
  db.fin_settings = db.fin_settings || [];
  const fs0 = db.fin_settings.find((x) => x.org_id === O); if (fs0) fs0.expenses_user = 'fp1'; else db.fin_settings.push({org_id: O, expenses_user: 'fp1'});
  db.fin_inbox = db.fin_inbox || [];
  db.fin_inbox.push({id: 'rc1', org_id: O, site_id: null, status: 'new', stage: 'new', source: 'upload', received_at: '2026-11-06T09:00:00Z', file_path: `expenses/${O}/b1/r.jpg`, file_name: 'Receipt.jpg', content_type: 'image/jpeg',
    extracted: {receipt: true, expense_id: 'e1', category: 'fuel', label: 'Van AB12 CDE', note: null, sent_by: 'Ollie Roofer', supplier: 'Fuel'}, query_reason: 'Expense receipt from Ollie Roofer', assigned_pm: 'fp1', assigned_at: '2026-11-06T09:00:00Z'});
  db.purchase_invoices = db.purchase_invoices || [];
  await ctx.route('**/rest/v1/rpc/fin_inbox_file', async (r) => { const b = JSON.parse(r.request().postData() || '{}'); const it = db.fin_inbox.find((x) => x.id === b.p_id); const pi = {id: 'pi-' + b.p_id, org_id: O, kind: 'invoice', file_path: it.file_path, file_name: it.file_name, ...b.p_pi}; db.purchase_invoices.push(pi); it.status = 'filed'; it.purchase_invoice_id = pi.id; r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, pi})}); });
  const signed = [];
  ctx.on('request', (q) => { const u = q.url(); if (/\/storage\/v1\/object\/sign\//.test(u)) signed.push(decodeURIComponent(u)); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  const t = page.getByRole('tab', {name: /^Received/}); if (await t.count()) { await t.first().click(); await page.waitForTimeout(800); }
  const txt = await page.locator('body').innerText();
  check(/Receipt For Fiona/.test(txt), 'Received lists it as "Receipt For Fiona"');
  check(!/Unable to read/.test(txt), 'not as "Unable to read"');
  await page.screenshot({path: 'shots/rcpt-list.png'});

  await page.goto('http://localhost:8081/fin/inbox/rc1'); await page.waitForTimeout(6000);
  const t2 = await page.locator('body').innerText();
  check(/Expense receipt from Ollie Roofer \(fuel\), for Van AB12 CDE/.test(t2), 'the note says who sent it, fuel, and the vehicle');
  check(await page.getByLabel('Line 1 description').inputValue() === 'Fuel — Van AB12 CDE', 'line 1 is ready: ' + await page.getByLabel('Line 1 description').inputValue());
  check(signed.some((u) => /\/object\/sign\/site-photos\/expenses\//.test(u)), 'the receipt photo opens from site-photos (' + (signed[0] || 'no request').replace(/^.*\/object\/sign\//, '').slice(0, 40) + ')');
  await page.screenshot({path: 'shots/rcpt-open.png'});

  await page.getByLabel('Line 1 unit price').click(); await page.keyboard.type('41.50');
  await page.getByLabel('Line 1 job').click(); await page.keyboard.type('J201'); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const yes = page.getByText(/Approve Anyway|^Yes$/); if (await yes.count()) { await yes.first().click(); await page.waitForTimeout(2500); }
  await page.waitForTimeout(3000);
  const pi = db.purchase_invoices.find((p) => p.id === 'pi-rc1');
  check(!!pi, 'Save files it as a purchase invoice');
  check(pi && pi.kind === 'receipt', 'kept as a receipt (' + (pi && pi.kind) + ')');
  check(pi && Number(pi.net) === 41.5 && pi.site_id === S1, 'for £41.50 on the job (' + (pi && pi.net) + ', ' + (pi && pi.site_id === S1) + ')');
  check(pi && !pi.invoice_no, 'no invoice number needed');
  check(pi && pi.file_path === `expenses/${O}/b1/r.jpg`, 'the receipt photo stays with it');

  // Finance Settings › Purchase invoices: who receipts go to.
  await page.goto('http://localhost:8081/fin/settings'); await page.waitForTimeout(4500);
  await page.getByText('Purchase invoices', {exact: true}).first().click(); await page.waitForTimeout(600);
  check(/Expense receipts go to[\s\S]{0,40}Fiona Books/.test(await page.locator('body').innerText()), 'Finance Settings shows receipts go to Fiona Books');
  await page.screenshot({path: 'shots/rcpt-settings.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
