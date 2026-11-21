// Site Rules into the Construction Phase Plan (Andy, 21 Nov 2026: "if a cpp has been completed to include within cpp.
// This then automatically updates the cpp with revision and issues and saves to one drive (also gives a pop up in site
// rules when you click yes add to cpp that it has updated, issued revision and auto exported (if one drive is linked)").
// Laptop: issue the sheet, Yes to the question, the plan goes to version 2 and into OneDrive. Phone: no OneDrive folder,
// No to the question, then Add To CPP on the issued sheet. Fake database. node cpprules21-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'cpprules21'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, tag] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    const site = db.sites.find((s) => s.id === S1);
    const fns = [];
    global.__fn = (name, b) => { fns.push([name, b]); return name === 'onedrive-job-pack' && b.action === 'put' ? {ok: true, folder: '4. H&S/Construction Phase Plan'} : {ok: true}; };
    if (tag === 'laptop') {
      site.job_pack = {at: new Date().toISOString(), path: 'Jobs/Test', root_id: 'r1', drive_id: 'd1', drawings_folder_id: null, week1: null};
      db.job_pack_settings = [{org_id: me.org_id, enabled: true, config: {parent_path: 'Jobs', template_path: '', folders: [], files: [], weekly: {name: '{order}. Week {n}', addDate: false, weekStart: 1, week1: 'start'}, rules: {cpp_issued: {on: true, folder: '4. H&S/Construction Phase Plan'}}, template_read: new Date().toISOString()}}];
    } else site.job_pack = null;
    const today = new Date().toISOString().slice(0, 10);
    db.mc_documents = [{id: 'md1', org_id: me.org_id, site_id: S1, category: 'cpp', name: 'Construction Phase Plan v1 - Test', storage_path: `${S1}/cpp/x-v1.pdf`, uploaded_by: 'me', created_at: new Date().toISOString()}];
    db.cpp_plans = [{id: 'cp1', org_id: me.org_id, site_id: S1, title: 'Construction Phase Plan', status: 'issued', version: 1, mc_document_id: 'md1', updated_at: new Date().toISOString(),
      data: {siteName: 'Test Site', version: 1, pm: {name: 'Andy Admin', phone: '07700 900123', email: ''}, emergencyMobile: '07700 900999', revisions: [{version: 1, date: today, by: 'Andy Admin', note: 'First issue', docId: 'md1', path: `${S1}/cpp/x-v1.pdf`}], issues: [{copy: '1', version: '1', issuedTo: 'Client', date: today}]}}];
    db.site_rules_builds = []; db.site_layout_docs = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(800); };
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${B}/sites/${S1}/mc/layout`); await page.waitForTimeout(5000);
    await page.getByText('+ Build Site Rules', {exact: true}).click(); await page.waitForTimeout(5000);
    await tab(/^Rules/);
    await page.getByLabel('Rule 1', {exact: true}).fill('Sign in at the site office before starting work.'); await page.waitForTimeout(1800);
    await tab(/^Issue/);
    await page.getByText('Issue Site Rules', {exact: true}).click(); await page.waitForTimeout(800);
    if (/Issue it anyway/.test(await text())) await page.getByText('Yes', {exact: true}).last().click();
    await page.waitForTimeout(7000);
    let t = await text();
    check(db.site_rules_builds[0].status === 'issued' && /Add these site rules to the Construction Phase Plan\?/.test(t) && /issues version 2 of the plan/.test(t) && /OneDrive/.test(t), `${tag}: after issuing, it asks: Add these site rules to the Construction Phase Plan? (version 2, OneDrive)`);
    await page.screenshot({path: path.join(SHOTS, `question-${tag}.png`)});
    const cpp = () => db.cpp_plans[0];
    const body2 = () => ((cpp().data.sections || []).find((s) => s.num === '2') || {}).body || '';
    if (tag === 'laptop') {
      await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(9000);
      t = await text();
      check(cpp().version === 2 && cpp().status === 'issued' && /2\.1 Site Rules[\s\S]*\n1\. Sign in at the site office before starting work\./.test(body2()), `laptop: Yes puts the rules in the plan's 2.1 Site Rules and issues version 2 (now v${cpp().version})`);
      const rev = (cpp().data.revisions || []).find((r) => r.version === 2);
      check(!!rev && /Site rules updated from the Site Rules sheet \(version 1\)/.test(rev.note), `laptop: the revision history says why (${rev && rev.note})`);
      const docs = db.mc_documents.filter((d) => d.category === 'cpp');
      check(docs.some((d) => /Construction Phase Plan v2/.test(d.name)) && /Superseded by v2/.test(docs.find((d) => d.id === 'md1').name), 'laptop: v2 is filed in the CPP folder, v1 stays marked superseded');
      const put = fns.find(([n, b]) => n === 'onedrive-job-pack' && b.action === 'put' && b.rule === 'cpp_issued');
      check(!!put && /Construction Phase Plan v2/.test(put[1].filename) && !!put[1].content_base64, `laptop: the new plan is saved to the job's OneDrive folder (${put ? put[1].filename : 'not sent'})`);
      check(/Construction Phase Plan Updated/.test(t) && /✓ The site rules are in the plan’s Site Rules section/.test(t) && /✓ Version 2 is issued/.test(t) && /✓ Saved to OneDrive \(4\. H&S\/Construction Phase Plan\)/.test(t), 'laptop: the pop-up says: rules in, version 2 issued, saved to OneDrive');
      await page.screenshot({path: path.join(SHOTS, `done-${tag}.png`)});
      await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(2500);
      t = await text();
      check(/Site Rules · Version 1/.test(t) && !/Add To CPP/.test(t), 'laptop: afterwards the sheet has no Add To CPP (the plan has its rules)');
    } else {
      await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(3000);
      t = await text();
      check(cpp().version === 1 && /Add To CPP/.test(t) && /doesn't have these rules yet/.test(t), 'phone: No leaves the plan alone; the issued sheet offers Add To CPP');
      await page.screenshot({path: path.join(SHOTS, `issued-${tag}.png`)});
      await page.getByText('Add To CPP', {exact: true}).click(); await page.waitForTimeout(1000);
      await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(9000);
      t = await text();
      check(cpp().version === 2 && /1\. Sign in at the site office/.test(body2()), 'phone: Add To CPP › Yes issues version 2 with the rules');
      check(/✓ Version 2 is issued/.test(t) && /Not saved to OneDrive: this job has no OneDrive folder/.test(t) && !fns.some(([n, b]) => n === 'onedrive-job-pack' && b.action === 'put'), 'phone: no OneDrive folder: the pop-up says so, nothing sent');
      await page.screenshot({path: path.join(SHOTS, `done-${tag}.png`)});
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
