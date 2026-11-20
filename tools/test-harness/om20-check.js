// The O&M in tabs, with the Construction Phase Plan (Andy, 20 Nov 2026: "refresh the o&m completion process on the
// app.operativehub ... take into account the construction phase plan etc and what it can pull through from there").
// A job with an issued CPP and no Schedule of Works: + New O&M Manual takes the client, client's agent, principal designer,
// project manager, start date, address and outline of works from the plan; the tabs (Details / People / Works / Appendix /
// Issue); Fill From The Construction Phase Plan never overwrites; the issued plan can go in the back; Issue checks what's
// left, offers practical completion, makes Revision 1 then Revision 2 with what changed; the Handover list shows the
// revision. Laptop, then a phone. Fake database and server; nothing is sent. node om20-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
let lastT = ''; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) { process.exitCode = 1; if (process.env.DBG) console.log('   TEXT:', lastT.slice(0, 1500)); } };
const BASE = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'om20'); require('fs').mkdirSync(SHOTS, {recursive: true});
const plan = {
  pc: {name: 'RTB Roofing Ltd', address: 'Unit 1\nYard Lane, Chelmsford', phone: '01234 567890', email: 'office@rtb.co'},
  siteName: 'Studley Rd', siteAddress: '1 Studley Rd\nLondon SW4 6RZ', version: 1, outline: 'Main roof\n- Strip and re-felt in Bauder\n- New lead flashings',
  startDate: '2026-09-01', client: {name: 'Bellway Homes', address: '', phone: '0207 000 0000', email: 'site@bellway.co', contact: 'Sam Jones'},
  clientAgent: 'Pellings LLP', principalDesigner: 'Stace LLP', architect: 'N/A', pm: {name: 'Pat PM', phone: '07700 900000', email: 'pat@rtb.co'},
  contacts: [{role: 'Principal Designer', name: 'Stace', day: '0203 111 2222', ooh: ''}], sections: [], revisions: [],
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  db.sites.find((x) => x.id === S1).responsible_pm_id = null; // no PM on the job: the plan's project manager is used
  db.handover_docs = []; db.handover_om_manuals = []; db.schedule_sections = []; db.schedule_tasks = [];
  db.cpp_plans = [{id: 'cpp1', site_id: S1, org_id: O, title: 'Construction Phase Plan', status: 'issued', version: 1, updated_at: '2026-11-19T10:00:00Z', mc_document_id: 'mcd1', data: plan}];
  db.mc_documents = [{id: 'mcd1', org_id: O, site_id: S1, category: 'cpp', name: 'Construction Phase Plan v1 - Studley Rd', storage_path: `${S1}/cpp/x-Construction_Phase_Plan_v1.pdf`, created_at: '2026-11-19T10:00:00Z'}];
  let pcDate = null; const rpcs = [];
  global.__rpc = (name, b) => {
    if (name === 'site_completion') return [{pc_date: pcDate, defects_months: pcDate ? 12 : null}];
    if (name === 'set_site_completion') { rpcs.push(b); pcDate = b.p_pc_date; return true; }
    if (name === 'site_boq_works') return [];
    return undefined;
  };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (lastT = (await page.locator('body').innerText()).replace(/\s+/g, ' '));
  const vis = (label) => page.locator(`text="${label}" >> visible=true`);
  const values = () => page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((e) => e.value));
  const tab = async (name) => { await page.getByRole('tab', {name: new RegExp(`^${name}`)}).first().click().catch(async () => { await vis(name).first().click(); }); await page.waitForTimeout(900); };
  const manual = () => db.handover_om_manuals[0]?.data;
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- A new manual, built from the job and its Construction Phase Plan ----
  await page.goto(`${BASE}/sites/${S1}/handover`); await page.waitForTimeout(5000);
  check(/Construction Phase Plan’s people and dates/.test(await text()), 'Handover says the manual is built with the CPP’s people and dates');
  await vis('+ New O&M Manual').first().click(); await page.waitForTimeout(7000);
  check(/\/om\//.test(page.url()) && db.handover_om_manuals.length === 1, 'the manual is built and opened');
  let t = await text();
  check(['Details', 'People', 'Works', 'Appendix', 'Issue'].every((x) => t.includes(x)) && /Not Issued Yet/.test(t), 'five tabs, like the CPP builder; "Not Issued Yet"');
  const team = (manual().sections.find((s) => s.key === 'team') || {}).rows || [];
  const row = (re) => team.find((r) => re.test(r[0])) || [];
  check(row(/^Client$/)[1] === 'Bellway Homes (Sam Jones)' && row(/Principal Designer/)[1] === 'Stace LLP' && row(/Principal Designer/)[2] === '0203 111 2222' && row(/Agent/)[1] === 'Pellings LLP' && row(/Project Manager/)[1] === 'Pat PM',
    `the Project Team comes from the plan (${team.filter((r) => r[1]).map((r) => `${r[0]}: ${r[1]}`).join(' | ')})`);
  check(manual().dates?.start === '2026-09-01' && /Studley Rd/.test(manual().cover.address), `start on site from the plan; the cover keeps the job’s own address (${manual().cover.address})`);
  const so = manual().sections.find((s) => /sign-off/i.test(s.title)).rows; const cdEmail = (manual().sections.find((s) => /contractor details/i.test(s.title)).rows.find((r) => r[0] === 'Email') || [])[1];
  check(so[0][1] === 'Pat PM' && so[0][2] === 'Sam Jones' && cdEmail === 'pat@rtb.co', `no responsible PM on the job: the plan's project manager signs off, with the client's contact (${so[0].join(' | ')}; ${cdEmail})`);
  check(/Strip and re-felt in Bauder/.test(manual().sections.find((s) => s.key === 'scope').body), 'no Schedule of Works: the scope starts as the plan’s outline of works');
  // Details tab
  t = await text();
  check(/Cover/i.test(t) && /Key Dates/i.test(t) && /Start On Site/.test(t) && /Practical Completion/.test(t) && /Not Set Yet/.test(t) && /1\. Introduction/.test(t), 'Details: cover, key dates (practical completion not set yet) and the introduction');
  await page.screenshot({path: path.join(SHOTS, 'details.png'), fullPage: true});

  // People tab
  await tab('People');
  t = await text(); let v = await values();
  check(/v1, issued/.test(t) && v.includes('Stace LLP') && v.includes('Bellway Homes (Sam Jones)') && /Only the roles with a name go in the manual/.test(t), 'People: from the issued plan; the Project Team open with the names in');
  await page.screenshot({path: path.join(SHOTS, 'people.png'), fullPage: true});
  await vis('↻ Fill From The Construction Phase Plan').first().click(); await page.waitForTimeout(1200);
  check(/Nothing to fill in/.test(await text()), 'filling again: nothing to fill in, and it says so');
  // Typed text is kept: change the PD, fill again.
  const pd = page.locator('input, textarea').nth((await values()).indexOf('Stace LLP'));
  await pd.fill('Stace LLP (Jo Bloggs)'); await page.waitForTimeout(1500);
  await vis('↻ Fill From The Construction Phase Plan').first().click(); await page.waitForTimeout(2500);
  check(((manual().sections.find((s) => s.key === 'team').rows.find((r) => /Principal Designer/.test(r[0])) || [])[1]) === 'Stace LLP (Jo Bloggs)', 'what’s typed is never overwritten by the plan');

  // Works tab
  await tab('Works');
  t = await text();
  check(/Scope Of Works Completed/i.test(t) && /Fill From The Construction Phase Plan/.test(t) && /Materials Log/.test(t) && /Guarantees & Warranties/.test(t) && /Maintenance Procedures/.test(t) && /Health & Safety Information/.test(t) && !/Project Team/.test(t), 'Works: the scope (with Fill From The CPP), then materials, guarantees, maintenance, H&S… (no people)');
  await page.screenshot({path: path.join(SHOTS, 'works.png'), fullPage: true});

  // Appendix tab: the issued plan can go in the back.
  await tab('Appendix');
  await vis('+ Add To The Back ▾').first().click(); await page.waitForTimeout(1200);
  await vis('📋 Construction Phase Plan v1 - Studley Rd').last().click(); await page.waitForTimeout(2500);
  check((manual().appendix || []).some((e) => e.kind === 'file' && e.bucket === 'mc-documents' && /Construction_Phase_Plan_v1/.test(e.path)), 'the issued Construction Phase Plan goes in the back');

  // Issue tab: what's left, practical completion, Revision 1.
  await tab('Issue');
  t = await text();
  check(/Before You Issue/i.test(t) && /✓ Scope Of Works Filled In/.test(t) && /! Practical Completion Date Set/.test(t) && /! Guarantees Listed/.test(t) && /✓ Principal Designer Named/.test(t) && /Handover & Sign-off/.test(t), 'Before You Issue: scope ✓, PD ✓, practical completion and guarantees still to do; the sign-off is here');
  check(/Issue Revision 1/.test(t) && /Export ▾/.test(t), 'Issue Revision 1 and Export ▾ on one row');
  await page.screenshot({path: path.join(SHOTS, 'issue.png'), fullPage: true});
  await vis('Issue Revision 1').first().click(); await page.waitForTimeout(1500);
  check(/Practical completion isn’t set for this job\. Set it to today/.test(await text()), 'issuing offers practical completion as today (Yes / No)');
  await vis('Yes').last().click(); await page.waitForTimeout(9000);
  check(rpcs.length === 1 && /^\d{4}-\d\d-\d\d$/.test(rpcs[0].p_pc_date) && rpcs[0].p_defects_months === 12, `practical completion set to today, 12 months defects (${JSON.stringify(rpcs[0] || {})})`);
  const m1 = manual();
  check(m1.revisions?.length === 1 && m1.revisions[0].rev === '1' && m1.revisions[0].note === 'First issue' && /\/handover\/.*\/issued\/.*OM_Manual_Rev_1\.pdf$/.test(m1.revisions[0].path || '') && m1.cover.revision === '1',
    `Revision 1 recorded, its PDF kept with the manual (${JSON.stringify(m1.revisions || [])})`);
  const close = page.getByRole('button', {name: 'Close'}).last(); if (await close.count()) { await close.click().catch(() => {}); await page.waitForTimeout(800); }
  t = await text();
  check(/Revision 1 Issued/.test(t) && /Revisions/i.test(t) && /Issue Revision 2/.test(t) && /✓ Practical Completion Date Set/.test(t), 'after issuing: "Revision 1 Issued", the revisions list, and Issue Revision 2 next');
  // Revision 2 asks what changed.
  await page.getByRole('button', {name: 'Issue Revision 2'}).first().click(); await page.waitForTimeout(1200);
  check(/What Has Changed In Revision 2\?/.test(await text()), 'Revision 2 asks what has changed');
  await page.locator('input:visible, textarea:visible').last().fill('Guarantees added');
  await vis('OK').last().click(); await page.waitForTimeout(9000);
  const m2 = manual();
  check(m2.revisions?.length === 2 && m2.revisions[1].rev === '2' && m2.revisions[1].note === 'Guarantees added' && rpcs.length === 1, 'Revision 2 recorded with what changed (practical completion not asked again)');
  if (await close.count()) { await close.click().catch(() => {}); await page.waitForTimeout(800); }
  await page.screenshot({path: path.join(SHOTS, 'issued.png'), fullPage: true});

  // Handover list shows the revision.
  await page.goto(`${BASE}/sites/${S1}/handover`); await page.waitForTimeout(5000);
  check(/Revision 2 Issued/.test(await text()), 'the Handover list shows "Revision 2 Issued"');

  // ---- On a phone ----
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${BASE}/sites/${S1}/om/${db.handover_om_manuals[0].id}`); await page.waitForTimeout(6000);
  const tabsFit = await page.evaluate(() => { const ts = [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width); return ts.length === 5 && ts.every((e) => { const r = e.getBoundingClientRect(); return r.right <= window.innerWidth + 1 && e.scrollWidth <= e.clientWidth + 1; }); });
  check(tabsFit, 'phone: the five tabs fit across the screen');
  await page.screenshot({path: path.join(SHOTS, 'phone-details.png'), fullPage: true});
  await tab('People'); await page.screenshot({path: path.join(SHOTS, 'phone-people.png'), fullPage: true});
  await tab('Issue'); await page.screenshot({path: path.join(SHOTS, 'phone-issue.png'), fullPage: true});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  global.__rpc = undefined;
  await browser.close();
})();
