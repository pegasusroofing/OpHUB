// Subcontractor close-out (Andy, 20 Nov 2026: "ok i like the close out, our pm/site manager sign off / retention release
// might not always be relevant so all it to be an invoice only style job or application style for the subcontractor").
// Our PM on a phone: the checks fill themselves in; Applications with retention (half at PC, half at end of defects);
// signing off with checks outstanding asks why; the certificate is filed. Their Project Manager sees it read-only.
// Fake database. node closeout21-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'closeout21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const now = new Date().toISOString();
const seed = (db, me, O) => {
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: now}];
  db.schedule_tasks = [{id: 't1', site_id: S1, name: 'Paint fascias', status: 'done', subcontractor_company_id: 'co1'}, {id: 't2', site_id: S1, name: 'Paint soffits', status: 'progress', subcontractor_company_id: 'co1'}];
  db.handover_om_manuals = [{id: 'om1', site_id: S1, org_id: O, subcontractor_company_id: 'co1', name: 'O&M', submitted_at: now, created_at: now}];
  db.rams_docs = [{id: 'r1', site_id: S1, name: 'Painting RAMS', status: 'current', approval_status: 'approved', subcontractor_company_id: 'co1', uploaded_at: now}];
  db.permits = []; db.snags = [{id: 's1', site_id: S1, title: 'Fascia touch-up', status: 'open', subcontractor_company_id: 'co1', created_at: now, tagged: []}];
  db.fin_subcontracts = []; db.subcontractor_closeouts = db.subcontractor_closeouts || [];
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const shared = {rows: []};
  // ---- Our PM ----
  {
    const {ctx, db} = await makeContext(browser, 'pm', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'pm', howto_dismissed: ['*'], signature_path: 'sig/me.png', name: 'Andy Cramp'});
    seed(db, me, me.org_id);
    let cert = null;
    await ctx.route(/supabase\.co\/storage\/v1\/object\//, async (route) => { const r = route.request(); if (r.method() === 'POST' && /closeout\//.test(r.url())) cert = r.postDataBuffer(); return route.fallback(); });
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
    check(/Close-Out Checks and sign-off/.test(await text()), 'the company page has a Close-Out tile');
    await page.getByText('Close-Out', {exact: true}).first().click(); await page.waitForTimeout(5000);
    let t = await text();
    check(/Schedule Of Works Complete 1 of 2 tasks/.test(t) && /O&M Manual Submitted Submitted/.test(t) && /RAMS Approved 1 approved/.test(t) && /Their Snags Closed 1 still open/.test(t), 'the checks fill themselves in from the job');
    await page.getByText('Applications', {exact: true}).first().click(); await page.waitForTimeout(1500);
    let row = db.subcontractor_closeouts[0];
    check(!!row && row.billing_type === 'application' && Number(row.retention_pct) === 5, `Applications: saved, retention starts at 5% (${row && row.billing_type})`);
    await page.getByPlaceholder('0.00').fill('12400'); await page.getByPlaceholder('5').click(); await page.waitForTimeout(1500);
    row = db.subcontractor_closeouts[0];
    check(Number(row.order_value) === 12400, `the order value saves (${row.order_value})`);
    row.pc_date = '2026-11-20'; row.defects_end = '2027-11-20';
    await page.reload(); await page.waitForTimeout(5000);
    t = await text();
    check(/Retention Held \(5%\): £620\.00/.test(t) && /First half £310\.00 at practical completion, 20 Nov 2026/.test(t) && /Second half £310\.00 at the end of defects, 20 Nov 2027/.test(t), 'retention held and the two halves with their dates');
    await page.screenshot({path: path.join(SHOTS, '1-closeout-applications-phone.png'), fullPage: true});
    // Invoice only: no retention.
    await page.getByText('Invoice Only', {exact: true}).first().click(); await page.waitForTimeout(1500);
    check(db.subcontractor_closeouts[0].billing_type === 'invoice' && /no retention to release/.test(await text()), 'Invoice Only: no retention');
    await page.getByText('Applications', {exact: true}).first().click(); await page.waitForTimeout(1200);
    // Sign off with checks outstanding: asks, then why.
    await page.getByText('✍ Sign Off As Complete', {exact: true}).click(); await page.waitForTimeout(800);
    check(/Close out anyway\?/.test(await text()), 'checks outstanding: it asks first');
    await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(800);
    await page.keyboard.type('Snag agreed as a contra charge'); await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(6000);
    row = db.subcontractor_closeouts[0];
    check(!!row.signed_at && row.signed_by === 'me' && !!row.certificate_path && row.override_reason === 'Snag agreed as a contra charge', 'signed off by our PM, the reason kept, the certificate filed');
    let pages = 0; try { pages = cert ? (await require('../../app-native/node_modules/pdf-lib').PDFDocument.load(cert)).getPageCount() : 0; } catch { pages = -1; }
    check(pages === 1, `the certificate is a one-page PDF (${pages})`);
    t = await text();
    check(/✓ Signed Off/.test(t) && /View Certificate/.test(t), 'it shows as signed off, with View Certificate');
    await page.screenshot({path: path.join(SHOTS, '2-closeout-signed-phone.png'), fullPage: true});
    shared.rows = db.subcontractor_closeouts;
    await ctx.close();
  }
  // ---- Their Project Manager: sees it, can't change it ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false});
    seed(db, me, me.org_id);
    if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
    db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: true}];
    db.subcontractor_closeouts = shared.rows;
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/closeout`); await page.waitForTimeout(5000);
    const t = await text();
    check(/✓ Signed Off/.test(t) && !/Undo Sign-Off/.test(t) && !/Sign Off As Complete/.test(t) && await page.getByPlaceholder('0.00').isEditable() === false, 'their Project Manager sees it signed off, read-only');
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
