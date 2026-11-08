// The last leftovers against the old app (Andy, 8 Nov 2026: "Do 30 Leftovers please"), on the fake database, laptop size:
// Finance — Getting Started steps (BoQ, client PO, set-up) with Add PO opening the PO form (several files, 20 MB check);
// changing Billed By asks first; an application's Status ▾ (back to Applied clears the certificate); "+ Someone New…" on
// an operative invoice; Bring People In From Xero (held back by the Finance trial for RTB, as in the current app).
// Projects — + Add Condition while filling a report (offered to the template too); Schedule of Works keeps the address of
// the last task added in a section; COSHH product › Use On A Job; O&M › + Schedule of Works offers the job's uploaded
// documents and an upload. Tapping a yard-stock cost on a project's Costs changes its qty, rate, date or job (yard_cost_edit).
// node leftovers-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const S2 = seed.S2;
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S3 = db.sites[2].id;
  db.job_finance.push({site_id: S3, org_id: O, billing_type: 'application', contract_value: null});
  db.fin_contract_items = (db.fin_contract_items || []).filter((x) => x.site_id !== S3);
  db.client_pos = (db.client_pos || []).filter((x) => x.site_id !== S3);
  // A report with a condition key and its template.
  const secs = () => [{id: 's1', title: 'Roof', traffic: {on: true, levels: [{id: 'tl_green', color: 'green', label: 'OK'}, {id: 'tl_red', color: 'red', label: 'Urgent'}]}, items: [{id: 'q1', type: 'text', label: 'Ridge'}]}];
  db.report_templates = [{id: 'tpl1', org_id: O, name: 'Roof survey', sections: secs()}];
  db.report_submissions = [{id: 'rs3', org_id: O, site_id: S1, template_id: 'tpl1', template_name: 'Roof survey', status: 'in_progress', submitted_by: db.profiles[0].id, submitted_at: new Date().toISOString(), sections: secs(), answers: {}}];
  // Multi-site addresses on S1.
  db.sites[0].multi_site = true;
  db.site_sub_addresses = [{id: 'ad1', site_id: S1, name: 'Plot 1', status: 'active'}, {id: 'ad2', site_id: S1, name: 'Plot 2', status: 'active'}];
  // A COSHH product, an O&M manual and an uploaded Schedule of Works PDF.
  db.rams_library_items = (db.rams_library_items || []).concat([{id: 'cp1', org_id: O, kind: 'coshh', title: 'Lead Sealant', data: {}}]);
  db.handover_om_manuals = [{id: 'om1', org_id: O, site_id: S1, name: 'O&M Manual', data: null}];
  db.schedule_documents = [{id: 'sd1', site_id: S1, org_id: O, name: 'Client SoW Rev B', storage_path: `${O}/${S1}/sow-rev-b.pdf`, visibility: 'all', created_at: '2026-11-01T09:00:00Z'}];
  // A yard-stock cost on S1: 10 slates at £5.
  db.fin_job_costs.push({id: 'yc1', org_id: O, site_id: S1, category: 'materials', cost_date: '2026-10-20', description: 'Yard stock: Slate × 10 nr', supplier: 'Yard', ref: 'YARD', net: 50, status: 'approved'});
  db.yard_stock = [{id: 'ys1', org_id: O, item: 'Slate', unit: 'nr', qty: 90}];
  db.yard_moves = [{id: 'ym1', org_id: O, stock_id: 'ys1', job_cost_id: 'yc1', qty: -10, site_id: S1, created_at: '2026-10-20T09:00:00Z'}];
  const rpcs = [];
  const fns = [];
  global.__fn = (name, b) => { fns.push([name, b]); return name === 'xero' && b.action === 'status' ? {connected: true, tenant: 'RTB Roofing Ltd'} : {ok: true}; };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('request', (r) => { if (r.url().includes('/rpc/yard_cost_edit')) rpcs.push(JSON.parse(r.postData() || '{}')); });
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Getting Started ----
  await page.goto(`${BASE}/fin/job/${S3}`); await page.waitForTimeout(5000);
  let t = await text();
  check(/Getting Started/.test(t) && /Set Up The Bill Of Quantities/.test(t) && /Add The Client’s PO/.test(t) && /Check Retention, VAT And Application Dates/.test(t), 'Getting Started: BoQ, client PO and set-up steps on a new application job');
  await page.screenshot({path: 'shots/leftovers-getting-started.png'});
  await page.getByText('Add PO', {exact: true}).click(); await page.waitForTimeout(2500);
  t = await text();
  check(/Client PO/.test(t) && /Attach The PO Files/.test(t), 'Add PO opens the client PO form, with Attach The PO Files inside it');
  await page.getByLabel('Close').last().click().catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500);

  // ---- Billed By change asks first ----
  await page.goto(`${BASE}/fin/job/${S2}?tab=setup`); await page.waitForTimeout(5000);
  await page.getByText('Edit ▾', {exact: true}).click(); await page.waitForTimeout(500);
  await menu('Edit Project Financials').click(); await page.waitForTimeout(1200);
  await page.getByLabel('Billed By', {exact: true}).click(); await page.waitForTimeout(500);
  await menu('Application (With Retention)').click(); await page.waitForTimeout(500);
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(1200);
  t = await text();
  check(/Change this project to applications\? The contract value will come from the Bill of Quantities\./.test(t), 'Billed By Invoice → Application: asked first');
  await menu('No').click(); await page.waitForTimeout(800);
  check(/Not changed/.test(await text()) && db.job_finance.find((j) => j.site_id === S2).billing_type === 'invoice', 'saying No leaves it billed by invoice');

  // ---- Application Status ▾ ----
  await page.goto(`${BASE}/fin/job/${S1}/application/a1`); await page.waitForTimeout(5000);
  await page.getByLabel(/^Status: /).click(); await page.waitForTimeout(600);
  t = await text();
  check(/✓ Certified/.test(t) && /Draft/.test(t) && /Applied/.test(t) && /Invoiced/.test(t), 'Status ▾ lists Draft · Applied · Certified · Invoiced, current ticked');
  await menu('Applied').click(); await page.waitForTimeout(600);
  check(/Take it back to Applied\? The certificate figures will be cleared\./.test(await text()), 'Certified → Applied asks first');
  await menu('Back To Applied').click(); await page.waitForTimeout(2000);
  const a1 = db.fin_applications.find((a) => a.id === 'a1');
  check(a1.cert_net == null && a1.status === 'submitted', 'back to Applied: the certificate is cleared');

  // ---- Operative invoice: + Someone New… ----
  await page.goto(`${BASE}/fin/labour/new`); await page.waitForTimeout(5000);
  await page.getByText('Choose who ▾', {exact: true}).click(); await page.waitForTimeout(600);
  await menu('+ Someone New…').click(); await page.waitForTimeout(600);
  await page.locator('input:visible').last().fill('Lee Newman Roofing'); await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const nw = (db.fin_labour_rates || []).find((r) => r.name === 'Lee Newman Roofing');
  check(!!nw && nw.pay_type === 'subcontractor' && nw.cis_rate === 20 && /Lee Newman Roofing ▾/.test(await text()), '+ Someone New…: added as a 20% CIS subcontractor and chosen');

  // ---- Costs: a yard-stock cost can be changed ----
  await page.goto(`${BASE}/fin/job/${S1}/costs`); await page.waitForTimeout(5000);
  await page.getByText('Yard stock: Slate × 10 nr').first().click(); await page.waitForTimeout(2000);
  t = await text();
  check(/Yard Stock On This Job/.test(t) && /90 nr left in the yard/.test(t) && /Rate £ — Net £50\.00/.test(t), 'tap a yard cost: qty, rate (net £50), date and job, with what’s left in the yard');
  await page.getByLabel('Qty (nr)').fill('12'); await page.waitForTimeout(300);
  check(/Net £60\.00/.test(await text()), 'the net follows the qty (12 × £5 = £60)');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(rpcs.length === 1 && rpcs[0].p_cost === 'yc1' && rpcs[0].p_qty === 12 && rpcs[0].p_net === 60 && rpcs[0].p_site === S1 && /Slate × 12 nr/.test(rpcs[0].p_desc), 'Save: yard_cost_edit with the new qty, net, job and wording');

  // ---- Directory › Labour: Bring People In From Xero ----
  await page.goto(`${BASE}/fin/directory?kind=labour`); await page.waitForTimeout(5000);
  check(await page.getByText('Bring People In From Xero', {exact: true}).count() === 1, 'Directory › Labour: Bring People In From Xero (Xero connected)');
  await page.getByText('Bring People In From Xero', {exact: true}).click(); await page.waitForTimeout(1500);
  check(/Finance trial/.test(await text()) && !fns.some(([n, b]) => n === 'xero' && b.action === 'workers'), 'RTB during the trial: held back, nothing asked of Xero (as the current app)');

  // ---- Report: + Add Condition ----
  await page.goto(`${BASE}/sites/${S1}/snagging/reports/fill/rs3`); await page.waitForTimeout(6000);
  await page.getByText('+ Add Condition', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByLabel('What it means').fill('Monitor — re-inspect in 12 months'); await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(1200);
  check(/Also add "Monitor — re-inspect in 12 months" to the template/.test(await text()), 'new condition: offered to the template too');
  await page.screenshot({path: 'shots/leftovers-condition.png'});
  await menu('Add To Template').click(); await page.waitForTimeout(2000);
  const lv = db.report_templates[0].sections[0].traffic.levels.map((l) => l.label);
  const sv = (db.report_submissions[0].sections || [])[0]?.traffic?.levels?.map((l) => l.label) || [];
  check(lv.includes('Monitor — re-inspect in 12 months') && sv.includes('Monitor — re-inspect in 12 months') && /Monitor — re-inspect in 12 months/.test(await text()), 'it is on this report, saved, and on the template');
  check(await page.getByLabel('Remove Monitor — re-inspect in 12 months').count() === 1 && await page.getByLabel('Remove OK').count() === 0, 'only a condition added on site has ✕');

  // ---- Schedule of Works: same address as the last task ----
  await page.goto(`${BASE}/sites/${S1}/schedule`); await page.waitForTimeout(6000);
  await page.getByText('+ ADD TASK').first().click(); await page.waitForTimeout(600);
  await page.getByPlaceholder('New task, e.g. Fit lead flashing').fill('Strip ridge'); await page.getByText('Plot 2', {exact: true}).last().click();
  await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(2000);
  t = await text();
  const tk = (db.schedule_tasks || []).find((x) => x.name === 'Strip ridge');
  check(!!tk && tk.sub_site_id === 'ad2' && /Tagged to Plot 2 — same address as the last task added here/.test(t), 'first task tagged to Plot 2; the next one in the section is too');
  await page.getByLabel('Close').last().click(); await page.waitForTimeout(500);
  await page.getByText('+ ADD TASK').first().click(); await page.waitForTimeout(600);
  check(/Tagged to Plot 2/.test(await text()), 'still remembered after closing and opening the box');
  await page.getByPlaceholder('New task, e.g. Fit lead flashing').fill('Re-bed ridge'); await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check((db.schedule_tasks || []).find((x) => x.name === 'Re-bed ridge')?.sub_site_id === 'ad2', 'second task saved to Plot 2');

  // ---- COSHH: Use On A Job ----
  await page.goto(`${BASE}/pm/admin/coshh/cp1`); await page.waitForTimeout(5000);
  await page.getByText('Use On A Job', {exact: true}).click(); await page.waitForTimeout(600);
  t = await text();
  check(/Which job is it for\?/.test(t), 'Use On A Job: asks which job');
  await page.locator('text=/· ' + db.sites[0].name + '$|^' + db.sites[0].name + '$/ >> visible=true').last().click(); await page.waitForTimeout(3000);
  check(page.url().includes(`/sites/${S1}/hs/coshh/new`) && page.url().includes('pick=cp1'), 'then that job’s Add COSHH page with the product ticked');

  // ---- O&M: + Schedule of Works ----
  await page.goto(`${BASE}/sites/${S1}/om/om1`); await page.waitForTimeout(7000);
  await page.getByText('+ Schedule of Works', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await text();
  check(/This Job’s Schedule Of Works \(From The App\)/.test(t) && /Client SoW Rev B \(Uploaded To The Schedule Of Works\)/.test(t) && /Upload A File \(PDF Or Photo\)/.test(t), 'O&M › + Schedule of Works: the app’s, the uploaded one, or upload a file');
  await page.screenshot({path: 'shots/leftovers-om.png'});

  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
