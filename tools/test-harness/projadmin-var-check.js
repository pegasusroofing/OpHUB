// Andy, 7 Nov 2026 (phone): Project Admin — the Client row reads across (it was squeezed into a vertical strip), the
// Client PO is a row under the contract value, one Edit ▾ button (Edit Project / Edit Project Financials / Link
// Estimating Folder, the last gone once a folder is linked), no Client POs list at the bottom, no practical completion or
// defects period. Project Financials on an invoice job: payment due days only (no final date, no application date),
// VAT and company overheads on one line, overheads only for an admin or Finance Controller.
// Variations and Day Works: Approved across the top with Issued and Rejected below (three even tiles on a laptop), the
// + button on the Variations / Day Works row, the filter row spread across the page, the approved value filled in from
// the value issued (and still editable), tidier rows. Fake database. node projadmin-var-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const setup = (db) => {
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S2 = db.sites.find((s) => s.id !== S1).id;
  const jf2 = db.job_finance.find((j) => j.site_id === S2); jf2.billing_name = 'Persimmon Homes (Thames Valley) Ltd'; jf2.billing_email = 'accounts.payable@persimmonhomes.example';
  db.client_pos = [{id: 'cp1', org_id: O, site_id: S2, po_number: 'PO-778', is_primary: true}];
  db.fin_variations = [
    {id: 'v1', org_id: O, site_id: S1, number: 'V001', title: 'Extra flashing to chimney', status: 'submitted', quoted: 2000, submitted_on: '2026-11-01', instructed_by: 'Site agent', cost_estimate: 900, seq: 1},
    {id: 'v2', org_id: O, site_id: S1, number: 'V002', title: 'Replace rotten fascia', status: 'agreed', quoted: 1600, agreed_value: 1500, agreed_on: '2026-11-03', seq: 2},
    {id: 'v3', org_id: O, site_id: S1, number: 'V003', title: 'Move skip', status: 'rejected', quoted: 300, seq: 3}];
  db.fin_dayworks = [
    {id: 'd1', org_id: O, site_id: S1, number: 'DW001', title: 'Clear gutters (2 men, 1 day)', status: 'issued', value: 400, work_date: '2026-11-04', seq: 1},
    {id: 'd2', org_id: O, site_id: S1, number: 'DW002', title: 'Make safe after storm', status: 'approved', value: 250, approved_on: '2026-11-05', seq: 2}];
  db.quotes = [];
  return S2;
};
const login = async (page) => {
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const box = (page, text) => page.evaluate((t) => { const el = [...document.querySelectorAll('div')].filter((d) => d.textContent === t && !d.children.length).pop(); const r = el && el.getBoundingClientRect(); return r ? {x: r.x, y: r.y, w: r.width, h: r.height} : null; }, text);
const tile = (page, label) => page.evaluate((t) => { const el = [...document.querySelectorAll('div')].find((d) => d.textContent === t && !d.children.length); const p = el && el.parentElement; const r = p && p.getBoundingClientRect(); return r ? {x: r.x, y: r.y, w: r.width} : null; }, label);
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  const S2 = setup(db);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await login(page);

  // Project Admin (an invoice job).
  await page.goto(`http://localhost:8081/fin/job/${S2}?tab=setup`); await page.waitForTimeout(6000);
  let t = await page.locator('body').innerText();
  const lab = await box(page, 'Client');
  check(lab && lab.h < 30 && lab.w > 40, 'the Client label reads across, not down (' + (lab && `${Math.round(lab.w)}×${Math.round(lab.h)}`) + ')');
  const cv = await box(page, 'Contract Value'), po = await box(page, 'Client PO');
  check(cv && po && po.y > cv.y && po.y - cv.y < 60 && /PO-778/.test(t), 'the Client PO is a row under the contract value (PO-778)');
  check(!/Client POs/.test(t) && !/\+ Client PO/.test(t), 'no Client POs list at the bottom');
  check(!/Practical completion|Defects period/i.test(t), 'no practical completion or defects period');
  check(/Due in \d+ days/.test(t) && !/final \d+ days/.test(t), 'an invoice job’s payment terms: due days only');
  check(/Company Overheads/.test(t), 'an admin sees the company overheads');
  check(!/Edit Project Financials/.test(t) && !/Link Estimating Folder/.test(t) && (await page.getByText('Edit ▾', {exact: true}).count()) === 1, 'one Edit ▾ button');
  await page.screenshot({path: 'shots/projadmin-phone.png', fullPage: true});
  await page.getByText('Edit ▾', {exact: true}).click(); await page.waitForTimeout(700);
  t = await page.locator('body').innerText();
  check(/Edit Project\n/.test(t + '\n') && /Edit Project Financials/.test(t) && /Link Estimating Folder/.test(t), 'Edit offers Edit Project, Edit Project Financials and Link Estimating Folder');
  await page.screenshot({path: 'shots/projadmin-edit.png'});
  await page.locator('text="Edit Project Financials" >> visible=true').last().click(); await page.waitForTimeout(1200);
  t = await page.locator('body').innerText();
  check(/Project Financials/.test(t) && /Payment Due \(Days\)/.test(t), 'Edit Project Financials opens the form');
  check(!/Final Date/.test(t) && !/Application Date/.test(t), 'an invoice job: no final date and no application date');
  check(!/Practical completion|Defects period/i.test(t), 'no practical completion date or defects period in the form');
  const vat = await box(page, 'VAT'), ohp = await box(page, 'Company Overheads %');
  check(vat && ohp && Math.abs(vat.y - ohp.y) < 4 && ohp.x > vat.x, 'VAT and company overheads on one line');
  await page.screenshot({path: 'shots/projfin-form.png'});
  await page.getByLabel('Close').last().click(); await page.waitForTimeout(600);
  // The Client PO row opens the PO.
  await page.getByRole('button', {name: /^Client PO: /}).click(); await page.waitForTimeout(700);
  t = await page.locator('body').innerText();
  check(/PO PO-778 \(Main\)/.test(t) && /\+ Add Client PO/.test(t), 'tapping the Client PO row offers the PO, or adding another');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // Linked: Link Estimating Folder goes.
  db.sites.find((s) => s.id === S2).estimating_linked_at = new Date().toISOString();
  await page.reload(); await page.waitForTimeout(6000);
  await page.getByText('Edit ▾', {exact: true}).click(); await page.waitForTimeout(700);
  t = await page.locator('body').innerText();
  check(/Edit Project Financials/.test(t) && !/Link Estimating Folder/.test(t), 'once the estimating folder is linked, Link Estimating Folder has gone');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // Variations (phone).
  await page.goto(`http://localhost:8081/fin/job/${S1}/variations`); await page.waitForTimeout(6000);
  const ap = await tile(page, 'Approved'), is = await tile(page, 'Issued, Waiting For Approval'), rj = await tile(page, 'Rejected');
  check(ap && is && rj && ap.w > 300 && Math.abs(is.y - rj.y) < 2 && is.y > ap.y && Math.abs(is.w - rj.w) < 2, 'phone: Approved across the top, Issued and Rejected side by side below');
  const nv = await page.getByText('+ Variation', {exact: true}).boundingBox(), dwTab = await page.getByRole('tab', {name: /^Day Works/}).last().boundingBox();
  check(nv && dwTab && Math.abs((nv.y + nv.height / 2) - (dwTab.y + dwTab.height / 2)) < 8, '+ Variation is on the Variations / Day Works row');
  const allT = await page.getByRole('tab', {name: /^All/}).boundingBox(), rejT = await page.getByRole('tab', {name: /^Rejected/}).boundingBox();
  check(allT && rejT && allT.x < 30 && rejT.x + rejT.width > 350, 'the All / Issued / Approved / Rejected row spreads across the page');
  t = await page.locator('body').innerText();
  check(!/by Site agent/.test(t) && !/cost £/.test(t), 'tidier rows: no "by" or "cost"');
  await page.screenshot({path: 'shots/var-phone.png', fullPage: true});
  // The approved value fills in from the value issued, and stays editable.
  await page.getByText('+ Variation', {exact: true}).click(); await page.waitForTimeout(1000);
  await page.getByLabel('Title', {exact: true}).fill('Extra lead work');
  await page.getByLabel('Value issued to client £').fill('750');
  await page.getByRole('button', {name: 'Status', exact: true}).click(); await page.waitForTimeout(500);
  await page.locator('text="Approved" >> visible=true').last().click(); await page.waitForTimeout(500);
  check(await page.getByLabel('Approved value £').inputValue() === '750', 'Approved: the approved value comes from the value issued (' + await page.getByLabel('Approved value £').inputValue() + ')');
  await page.getByLabel('Value issued to client £').fill('800'); await page.waitForTimeout(200);
  check(await page.getByLabel('Approved value £').inputValue() === '800', 'and follows it until it’s changed');
  await page.getByLabel('Approved value £').fill('780'); await page.getByLabel('Value issued to client £').fill('820'); await page.waitForTimeout(200);
  check(await page.getByLabel('Approved value £').inputValue() === '780', 'changed by hand, it stays as typed (' + await page.getByLabel('Approved value £').inputValue() + ')');
  await page.screenshot({path: 'shots/var-form.png'});
  await page.getByLabel('Close').last().click(); await page.waitForTimeout(500);

  // Day Works (phone): the same.
  await page.goto(`http://localhost:8081/fin/job/${S1}/dayworks`); await page.waitForTimeout(6000);
  const ap2 = await tile(page, 'Approved'), is2 = await tile(page, 'Issued, Waiting For Approval'), rj2 = await tile(page, 'Rejected');
  check(ap2 && is2 && rj2 && ap2.w > 300 && Math.abs(is2.y - rj2.y) < 2 && is2.y > ap2.y, 'Day Works: the same tiles');
  const nd = await page.getByText('+ Day Work', {exact: true}).boundingBox(), vTab = await page.getByRole('tab', {name: /^Variations/}).last().boundingBox();
  check(nd && vTab && Math.abs((nd.y + nd.height / 2) - (vTab.y + vTab.height / 2)) < 8, '+ Day Work is on the Variations / Day Works row');
  const allD = await page.getByRole('tab', {name: /^All/}).boundingBox(), rejD = await page.getByRole('tab', {name: /^Rejected/}).boundingBox();
  check(allD && rejD && allD.x < 30 && rejD.x + rejD.width > 350, 'Day Works: the filter row spreads across the page');
  check((await page.getByText('Approve', {exact: true}).count()) >= 1, 'Approve is on the issued day work');
  await page.screenshot({path: 'shots/dw-phone.png', fullPage: true});

  // A PM who isn't a Finance Controller doesn't see the overheads.
  const b2 = await makeContext(browser, 'pm', [], {shot: true}); const S2b = setup(b2.db);
  const p2 = await b2.ctx.newPage(); await login(p2);
  await p2.goto(`http://localhost:8081/fin/job/${S2b}?tab=setup`); await p2.waitForTimeout(6000);
  check(!/Company Overheads/.test(await p2.locator('body').innerText()), 'a PM (not a Finance Controller) doesn’t see the company overheads');

  // Laptop: three even tiles on one row.
  const b3 = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}}); setup(b3.db);
  const p3 = await b3.ctx.newPage(); await login(p3);
  await p3.goto(`http://localhost:8081/fin/job/${S1}/variations`); await p3.waitForTimeout(6000);
  const a3 = await tile(p3, 'Approved'), i3 = await tile(p3, 'Issued, Waiting For Approval'), r3 = await tile(p3, 'Rejected');
  check(a3 && i3 && r3 && Math.abs(a3.y - i3.y) < 2 && Math.abs(i3.y - r3.y) < 2 && Math.abs(a3.w - i3.w) < 12 && Math.abs(i3.w - r3.w) < 2, 'laptop: three even tiles on one row (' + [a3, i3, r3].map((x) => x && Math.round(x.w)).join(' / ') + ')');
  await p3.screenshot({path: 'shots/var-laptop.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
