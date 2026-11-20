// Subcontractors' O&M manuals (Andy, 20 Nov 2026: "We need it so that subcontractors submit or can do their o&ms too, and
// then that would add into our o&ms when we are main contractor as appendix's"). On a phone, a subcontractor's admin (an
// operative flagged admin of Acme Scaffolding on the job): the O&M Manual tile on their company page; Build One Here starts
// from the tasks given to them only; their builder has no practical completion or CPP; Submit Revision 1 submits it; they
// also upload their own PDF. Then the main contractor (same job, laptop): Handover lists both; the manual's Appendix tab
// counts 2 submitted; issuing it puts both subcontractor PDFs in the back (pages counted in the uploaded PDF).
// Fake database; nothing is sent. node subom20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const {PDFDocument} = require('../../app-native/node_modules/pdf-lib');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'subom20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const pdf3 = await PDFDocument.create(); for (let i = 0; i < 3; i++) pdf3.addPage([595, 842]); const sub3 = Buffer.from(await pdf3.save());
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  const O = me.org_id;
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Acme Scaffolding', created_at: '2026-11-01T09:00:00Z'}, {id: 'co2', org_id: O, site_id: S1, name: 'Bolt Electrical', created_at: '2026-11-01T09:00:00Z'}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: true}];
  db.schedule_sections = [{id: 'ss1', site_id: S1, name: 'Scaffold', position: 0}, {id: 'ss2', site_id: S1, name: 'Main Roof', position: 1}];
  db.schedule_tasks = [
    {id: 'st1', site_id: S1, section_id: 'ss1', name: 'Erect tube and fitting scaffold', status: 'done', position: 0, subcontractor_company_id: 'co1'},
    {id: 'st2', site_id: S1, section_id: 'ss2', name: 'Strip and re-felt', status: 'done', position: 1, subcontractor_company_id: null},
  ];
  db.handover_om_manuals = []; db.handover_docs = []; db.coshh_docs = []; db.cpp_plans = [];
  // Files: the subcontractors' PDFs come back as a 3-page PDF; capture the main contractor's issued manual.
  let issued = null; const subPaths = [];
  await ctx.route(/supabase\.co\/storage\/v1\/object\//, async (route) => {
    const req = route.request(), u = req.url();
    if (req.method() === 'GET' && (/\/subs\//.test(u) || subPaths.some((p) => u.includes(p)))) return route.fulfill({status: 200, contentType: 'application/pdf', body: sub3});
    if (req.method() === 'POST' && /\/issued\//.test(u) && !/\/subs\//.test(u)) { issued = req.postDataBuffer(); }
    return route.fallback();
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  const tab = async (n) => { await page.getByRole('tab', {name: new RegExp(`^${n}`)}).first().click(); await page.waitForTimeout(900); };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- The subcontractor's admin ----
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
  let t = await text();
  check(/Handover/.test(t) && /O&M manual/.test(t), 'their company page has the Handover tile (O&M manual)');
  await vis('Handover').first().click(); await page.waitForTimeout(4000);
  t = await text();
  check(/goes in the back of/.test(t) && /Upload Our O&M \(PDF\)/.test(t) && /\+ Build One Here/.test(t), 'O&M page: upload their own, or build one here; says it goes in the back of the main contractor’s');
  await page.screenshot({path: path.join(SHOTS, 'sub-list.png'), fullPage: true});
  await vis('+ Build One Here').first().click(); await page.waitForTimeout(7000);
  const m1 = db.handover_om_manuals[0];
  check(!!m1 && m1.subcontractor_company_id === 'co1' && /\/mc\/subcontractors\/co1\/om\//.test(page.url()), `a manual for Acme Scaffolding, opened in the builder (${page.url().replace(B, '')})`);
  const scope = (m1.data.sections.find((s) => s.key === 'scope') || {}).body || '';
  check(/Erect tube and fitting scaffold/.test(scope) && !/Strip and re-felt/.test(scope), 'the scope is only the tasks given to them');
  check((m1.data.sections.find((s) => /contractor details/i.test(s.title)).rows[0] || [])[1] === 'Acme Scaffolding', 'their company is the contractor on page 2');
  t = await text();
  check(/Not Submitted Yet/.test(t) && !/Practical Completion/.test(t), 'their builder: "Not Submitted Yet", no practical completion');
  await tab('People');
  check(!/Construction Phase Plan/.test(await text()), 'People: no Construction Phase Plan for a subcontractor');
  await tab('Appendix');
  t = await text();
  check(/Your COSHH Assessments On This Job/.test(t) && !/Data Sheets \(/.test(t) && !/Subcontractors’ O&M/.test(t) && /Add A File To The Back/.test(t), 'Appendix: their COSHH and their own files only');
  await tab('Issue');
  t = await text();
  check(/Submit Revision 1/.test(t) && /sends it to/.test(t) && !/Practical Completion Date Set/.test(t) && !/Principal Designer/.test(t), 'Issue: Submit Revision 1 (to the main contractor); no completion or PD checks');
  await page.screenshot({path: path.join(SHOTS, 'sub-issue.png'), fullPage: true});
  await page.getByRole('button', {name: 'Submit Revision 1'}).first().click(); await page.waitForTimeout(9000);
  const m1b = db.handover_om_manuals.find((x) => x.id === m1.id);
  if (m1b.data.revisions?.[0]?.path) subPaths.push(m1b.data.revisions[0].path.split('/').pop());
  check(!!m1b.submitted_at && m1b.data.revisions?.[0]?.rev === '1' && /\/issued\//.test(m1b.data.revisions[0].path || ''), 'submitted: Revision 1 recorded and its PDF kept');
  const close = page.getByRole('button', {name: 'Close'}).last(); if (await close.count()) { await close.click().catch(() => {}); await page.waitForTimeout(800); }
  check(/Revision 1 Submitted/.test(await text()), '"Revision 1 Submitted" at the top');
  // Upload their own PDF too.
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/om`); await page.waitForTimeout(4000);
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), vis('⬆️ Upload Our O&M (PDF)').first().click()]);
  await fc.setFiles({name: 'Acme Scaffold Handover.pdf', mimeType: 'application/pdf', buffer: sub3}); await page.waitForTimeout(5000);
  const up = db.handover_om_manuals.find((x) => x.file_path);
  check(!!up && up.subcontractor_company_id === 'co1' && !!up.submitted_at && up.name === 'Acme Scaffold Handover' && /\/subs\/co1\//.test(up.file_path), 'their own PDF uploads and is submitted straight away');
  t = await text();
  check((t.match(/Submitted \d/g) || []).length === 2 && /Uploaded PDF/.test(t) && /Built Here/.test(t), 'their list: both submitted, one built here, one uploaded');
  await page.screenshot({path: path.join(SHOTS, 'sub-list-done.png'), fullPage: true});

  // ---- The main contractor ----
  me.role = 'admin'; db.subcontractor_operatives = [];
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(`${B}/sites/${S1}/handover`); await page.waitForTimeout(6000);
  t = await text();
  check(/Subcontractors’ O&M Manuals/.test(t) && /Acme Scaffolding — Acme Scaffolding O&M Manual/.test(t) && /Acme Scaffolding — Acme Scaffold Handover/.test(t) && /No O&M manuals yet/.test(t), 'Handover: the subcontractors’ manuals listed apart from ours');
  await page.screenshot({path: path.join(SHOTS, 'mc-handover.png'), fullPage: true});
  await vis('+ New O&M Manual').first().click(); await page.waitForTimeout(7000);
  await tab('Appendix');
  check(/Subcontractors’ O&M Manuals \(2 Submitted\)/.test(await text()), 'our manual’s Appendix: "Subcontractors’ O&M Manuals (2 Submitted)", ticked');
  await tab('Issue');
  await page.getByRole('button', {name: 'Issue Revision 1'}).first().click(); await page.waitForTimeout(1500);
  if (await vis('No').count()) { await vis('No').last().click(); }
  await page.waitForTimeout(12000);
  let pages = 0; try { pages = issued ? (await PDFDocument.load(issued)).getPageCount() : 0; } catch { pages = -1; }
  const own = db.handover_om_manuals.find((x) => !x.subcontractor_company_id);
  check(own?.data?.revisions?.length === 1 && pages >= 9 && !/could not be added/.test(await text()),`issued with both subcontractors’ PDFs in the back (${pages} pages: ours plus 3 + 3)`);
  await page.screenshot({path: path.join(SHOTS, 'mc-issued.png'), fullPage: true});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
