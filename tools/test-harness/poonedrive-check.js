// POs go to OneDrive too (Andy, 7 Nov 2026): ticking "File In Project PO Folder" on a saved PO files its PDF in OpHUB's PO folder
// AND copies it into the job's linked OneDrive "Material PO's" folder, under the same name (so the OneDrive → OpHUB sync
// doesn't bring it back as a second copy). No folder linked: filed in OpHUB only, nothing sent to OneDrive.
// Fake database; onedrive-upload is caught here, nothing reaches OneDrive.
// node poonedrive-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id;
  const S2 = db.sites.find((s) => s.id !== S1).id;
  const s1 = db.sites.find((s) => s.id === S1); s1.material_orders_folder_id = 'OD-FOLDER-1'; s1.material_orders_drive_id = 'OD-DRIVE-1'; s1.material_orders_folder_name = 'Material PO\'s';
  db.purchase_orders = (db.purchase_orders || []).concat([
    {id: 'pod1', org_id: O, site_id: S1, number: 'J101-PO-021', status: 'open', supplier_name: 'Jewson', value: 100, vat: 20, total: 120, items: [{item: 'Slates', qty: '1', rate: 100, amount: 100}], required_by: '2026-11-20'},
    {id: 'pod2', org_id: O, site_id: S2, number: 'J102-PO-004', status: 'open', supplier_name: 'SIG', value: 50, vat: 10, total: 60, items: [{item: 'Felt', qty: '1', rate: 50, amount: 50}], required_by: '2026-11-21'}]);
  const sent = [];
  await ctx.route('**/functions/v1/onedrive-upload', async (r) => { const b = JSON.parse(r.request().postData() || '{}'); sent.push(b); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const tickFolder = async () => {
    // The PO is in tabs since 20 Nov 2026: the filing tick is on the last tab.
    const t = page.getByRole('tab', {name: /^(Raise|Save & Send)/}); if (await t.count()) { await t.first().click(); await page.waitForTimeout(500); }
    await page.getByText(/^File In Project PO Folder/).first().click(); await page.waitForTimeout(800);
    const yes = page.locator('text="Yes, Tick It" >> visible=true'); if (await yes.count()) await yes.last().click();
    let seen = '';
    for (let i = 0; i < 24; i++) { await page.waitForTimeout(250); const t = await page.locator('body').innerText(); if (/Filed in the project/.test(t)) { seen = t; break; } }
    await page.waitForTimeout(1500);
    return seen;
  };

  await page.goto('http://localhost:8081/fin/po/pod1'); await page.waitForTimeout(5000);
  const msg1 = await tickFolder();
  const f1 = (db.material_order_files || []).find((x) => x.item_id === 'finpo-pod1');
  check(!!f1, 'filed in OpHUB’s PO folder (' + (f1 && f1.name) + ')');
  const u = sent[0] || {};
  check(sent.length === 1, 'copied to OneDrive once (' + sent.length + ')');
  check(u.folder_id === 'OD-FOLDER-1' && u.drive_id === 'OD-DRIVE-1', 'into the job’s linked Material PO’s folder');
  check(!!f1 && u.filename === f1.name, 'under the same name as in OpHUB, so the sync won’t bring it back (' + u.filename + ')');
  check(typeof u.content_base64 === 'string' && /^JVBER/.test(u.content_base64), 'the PO PDF itself is sent');
  check(/and its OneDrive folder/.test(msg1), 'the message says it’s in OneDrive too');
  await page.screenshot({path: 'shots/poonedrive.png'});

  await page.goto('http://localhost:8081/fin/po/pod2'); await page.waitForTimeout(5000);
  const msg2 = await tickFolder();
  check(!!(db.material_order_files || []).find((x) => x.item_id === 'finpo-pod2'), 'a job with no OneDrive PO folder: still filed in OpHUB');
  check(sent.length === 1, 'and nothing sent to OneDrive (' + sent.length + ')');
  check(/no OneDrive PO folder is linked/.test(msg2), 'it says no OneDrive PO folder is linked');

  // A minimum for OneDrive, set by the admin (Andy, 19 Nov 2026: "only if above a limit and have the admin set the minimum
  // value to upload"): under it, filed in OpHUB only; at or over it, into OneDrive as before.
  db.job_pack_settings = (db.job_pack_settings || []).filter((x) => x.org_id !== O);
  db.job_pack_settings.push({org_id: O, enabled: true, config: {parent_path: 'Jobs', template_path: '', folders: [], files: [], rules: {}, weekly: {name: 'Week {n}', addDate: true, weekStart: 1, week1: 'start'}, po_min: 500}});
  db.purchase_orders.push(
    {id: 'pod3', org_id: O, site_id: S1, number: 'J101-PO-022', status: 'open', supplier_name: 'Jewson', value: 400, vat: 80, total: 480, items: [{item: 'Battens', qty: '1', rate: 400, amount: 400}], required_by: '2026-11-22'},
    {id: 'pod4', org_id: O, site_id: S1, number: 'J101-PO-023', status: 'open', supplier_name: 'Jewson', value: 600, vat: 120, total: 720, items: [{item: 'Lead', qty: '1', rate: 600, amount: 600}], required_by: '2026-11-22'});
  await page.goto('http://localhost:8081/fin/po/pod3'); await page.waitForTimeout(5000);
  const msg3 = await tickFolder();
  check(!!(db.material_order_files || []).find((x) => x.item_id === 'finpo-pod3') && sent.length === 1, `a £400 PO with a £500 minimum: filed in OpHUB, not sent to OneDrive (${sent.length})`);
  check(/under the company’s minimum for OneDrive/.test(msg3), 'it says it’s under the minimum');
  await page.goto('http://localhost:8081/fin/po/pod4'); await page.waitForTimeout(5000);
  await tickFolder();
  check(sent.length === 2, `a £600 PO goes to OneDrive (${sent.length})`);
  // The admin sets it on the OneDrive page, Finance tab (a company with Finance, OneDrive connected).
  db.organizations[0].has_finance = true;
  db.onedrive_connections = [{org_id: O, account_email: 'andy@rtb.example', connected_at: '2026-11-08T21:24:00Z'}];
  global.__rpc = (n) => (n === 'onedrive_status' ? {exists: true, connected: true, needs_reconnect: false, account_email: 'andy@rtb.example'} : undefined);
  await page.goto('http://localhost:8081/pm/admin/onedrive'); await page.waitForTimeout(5000);
  // The OneDrive page's own Finance tab (the last one; the first is the Admin Centre's).
  await page.locator('[role="tab"]', {hasText: /^Finance$/}).last().click(); await page.waitForTimeout(1200);
  await page.screenshot({path: 'shots/poonedrive-min.png', fullPage: true});
  let t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(/only POs of £500 or more \(excl\. VAT\)/.test(t), 'the OneDrive page shows the minimum on Purchase Orders');
  await page.getByText('✎ Minimum £500', {exact: true}).click(); await page.waitForTimeout(800);
  await page.keyboard.press('Control+A'); await page.keyboard.type('750'); await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.job_pack_settings.find((x) => x.org_id === O).config.po_min === 750, `the admin changes it to £750 (${db.job_pack_settings.find((x) => x.org_id === O).config.po_min})`);
  await page.screenshot({path: 'shots/poonedrive-min.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
