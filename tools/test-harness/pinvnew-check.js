// The new purchase invoice screen (Andy, 5 Nov 2026): Add Manually opens line by line (no job picker first), lines with
// qty / unit / rate to 3 decimals / discount / VAT, a line split across two projects by %, then Save; an unread emailed
// invoice opens the same form with a plain note. Fake database only.
// node pinvnew-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 950}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  db.fin_suppliers = db.fin_suppliers || []; db.fin_suppliers.push({id: 'fs1', org_id: O, name: 'Jewson'});
  db.fin_inbox = db.fin_inbox || []; db.fin_inbox.push({id: 'ib9', org_id: O, status: 'new', stage: 'query', received_at: '2026-11-01T09:00:00Z', file_name: 'zza-two.pdf', query_reason: 'Couldn’t read it: Reader error: key problem'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(4000);
  await page.getByText('Add Manually', {exact: true}).click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/fin/pinv/new', 'Add Manually opens the new invoice screen straight away (' + new URL(page.url()).pathname + ')');
  check(await page.getByText('Attach The Invoice').count() === 1, 'it offers to attach the PDF, photo or scan');
  await page.getByLabel('Supplier', {exact: true}).last().click(); await page.waitForTimeout(500); await page.getByText('Jewson', {exact: true}).last().click(); await page.waitForTimeout(300);
  await page.getByLabel('Invoice number').fill('J-77');
  await page.getByLabel('Project', {exact: true}).last().click(); await page.waitForTimeout(600); await page.getByText(/J101/).last().click(); await page.waitForTimeout(500);
  await page.getByLabel('Line 1 description').fill('Bauder K4E capsheet'); await page.getByLabel('Line 1 quantity').fill('24'); await page.getByLabel('Line 1 unit price').fill('86.45'); await page.getByLabel('Line 1 discount').fill('10');
  await page.waitForTimeout(300);
  check(await page.getByText('£1,867.32').count() >= 1, 'line 1 comes to £1,867.32 (24 × £86.450 less 10%)');
  await page.getByText('+ Add A Line', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 2 description').fill('Type 3 trim'); await page.getByLabel('Line 2 quantity').fill('40'); await page.getByLabel('Line 2 unit price').fill('7.71');
  await page.getByLabel('Line 2 job').click(); await page.waitForTimeout(400); await page.getByText('⇄ Split across projects by %').click(); await page.waitForTimeout(400);
  await page.getByLabel('Split row 2 project').click(); await page.waitForTimeout(500);
  await page.waitForTimeout(300);
  const second = db.sites.find((s) => s.id !== S1 && s.org_id === O);
  if (second) await page.getByText(new RegExp(second.job_number || second.name)).last().click();
  await page.waitForTimeout(400);
  check(await page.getByText('Adds up to 100% ✓').count() === 1, 'the split adds up to 100%');
  await page.screenshot({path: 'shots/job/pinvnew-1300.png', fullPage: true});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(3000);
  const pi = db.purchase_invoices.find((i) => i.invoice_no === 'J-77');
  check(!!pi, 'the invoice was saved');
  if (pi) {
    check(pi.lines && pi.lines.length === 2 && pi.lines[0].disc === 10, 'its lines and discount are kept');
    check(Number(pi.net) === 2175.72, `net £${pi.net} (1,867.32 + 308.40)`);
    check(Array.isArray(pi.split) && pi.split.length === 2, 'the cost is split across the two projects: ' + JSON.stringify((pi.split || []).map((x) => [x.site_id.slice(0, 4), x.pct])));
  }
  // 6 Nov 2026: typed in by hand, Save approves it; it stays on the invoice, locked, with Edit on the one row of buttons.
  check(pi && pi.status === 'approved', 'typed in by hand, Save approves it (' + (pi && pi.status) + ')');
  check(pi && new URL(page.url()).pathname === '/fin/pinv/' + pi.id, 'after saving it stays on the invoice (' + new URL(page.url()).pathname + ')');
  check(!(await page.getByLabel('Line 1 description').isEditable()), 'saved, the boxes are locked');
  const ys = []; for (const t of ['Mark Paid Today', 'Reject', '✏️ Edit']) { const b = await page.getByText(t, {exact: true}).last().boundingBox(); ys.push(b ? Math.round(b.y) : -1); }
  check(ys.every((v) => v > 0 && Math.abs(v - ys[0]) < 3), 'Mark Paid Today, Reject and Edit on one row ' + ys.join(','));
  await page.screenshot({path: 'shots/job/pinvsaved-1300.png', fullPage: true});
  await page.getByText('✏️ Edit', {exact: true}).click(); await page.waitForTimeout(300);
  check(await page.getByLabel('Line 1 description').isEditable(), 'Edit opens it for changes');
  await page.getByText('Save Changes', {exact: true}).click(); await page.waitForTimeout(2500);
  check(!(await page.getByLabel('Line 1 description').isEditable()), 'and locks it again');
  await page.goto('http://localhost:8081/fin/inbox/ib9'); await page.waitForTimeout(4000);
  check(await page.getByText(/Unable to read this one automatically/).count() === 1, 'an unread invoice shows the plain note');
  check(await page.getByText(/API|Reader error/).count() === 0, 'the raw error is hidden until Why? is tapped');
  check(await page.getByLabel('Line 1 description').count() === 1, 'and the same line-by-line form');
  await page.screenshot({path: 'shots/job/pinvinbox-1300.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
