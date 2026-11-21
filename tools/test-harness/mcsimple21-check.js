// The two plans from the app review (Andy, 21 Nov 2026: "Yes build the 2 plans please"):
// Main Contractor made simple: the job row says what's left to set up; the page has "Set Up: n Of 5 Done", then Before Work /
// People / On Site tabs (no Programme tile), People lists everyone with Inducted and Site Rules; a manager shows a part to
// operatives from its ⋮; an operative sees My Induction and Permits To Sign only, and can't open the plan by link until it's
// shown; a subcontractor's page has Documents / Work / People / Handover tabs; Admin has one Main Contractor tab.
// Get Going: no logo lock; four steps first and the rest under Later.
// Fake database. node mcsimple21-check.js — pictures in shots/mcsimple21.
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'mcsimple21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const now = new Date().toISOString();

function seed(db, role) {
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {name: role === 'operative' ? 'Liam Walsh' : 'Andy Admin', role, howto_dismissed: ['*'], signature_path: 'sig/me.png'});
  const O = me.org_id;
  const site = db.sites.find((s) => s.id === S1);
  Object.assign(site, {acting_as_main_contractor: true, repair_contract: false, multi_site: false, mc_hidden_tiles: [], mc_shown_tiles: []});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sa-me', site_id: S1, user_id: 'me'});
  db.profiles.push({id: 'so-op', name: 'Ray Painter', role: 'operative', org_id: O, email: 'r@x.co'});
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: now}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'so-op', is_admin: true}];
  // F10 uploaded and a Site Rules document: 2 of 5 set up.
  db.mc_documents = [{id: 'mcd1', org_id: O, site_id: S1, category: 'f10', name: 'F10.pdf', storage_path: 'x/f10.pdf', uploaded_by: 'pm', uploaded_at: now}];
  db.site_layout_docs = [{id: 'lay1', site_id: S1, name: 'Site Rules v1', storage_path: 'x/rules.pdf', uploaded_by: 'pm', uploaded_at: now}];
  db.site_layout_signatures = [{id: 'ls1', layout_id: 'lay1', user_id: 'o1', signed_at: now}];
  db.site_induction_completions = [{id: 'ic1', site_id: S1, operative_id: 'o1', completed_at: now, pdf_path: 'x/ind.pdf'}];
  db.induction_templates = []; db.cpp_plans = [];
  db.permits = [{id: 'pt1', org_id: O, site_id: S1, permit_type: 'hot_works', status: 'open', assigned_user_ids: ['me'], issued_by: 'pm', issued_at: now, created_at: now, subcontractor_company_id: null}];
  db.permit_signoffs = [];
  return {me, site, O};
}
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const body = (page) => page.evaluate(() => document.body.innerText);
const tab = (page, label) => page.getByText(label, {exact: true}).filter({visible: true}).first().click();

(async () => {
  const browser = await chromium.launch(); const errs = [];

  // ---- A manager on a laptop ----
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    const {site} = seed(db, 'admin');
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await signIn(page);
    await page.goto(B + `/sites/${S1}`); await page.waitForTimeout(5000);
    let t = await body(page);
    // A manager gets Main Contractor mode since 21 Nov 2026: Set Up on the job's home says what's left.
    check(/Set Up: 2 Of 5 Done/.test(t), `the job's home says what's left to set up (${(t.match(/Main Contractor[^\n]*\n?[^\n]*/) || [''])[0].replace(/\n/g, ' | ')})`);
    await page.goto(B + `/sites/${S1}/mc`); await page.waitForTimeout(5000);
    t = await body(page);
    check(/Set Up: 2 Of 5 Done/.test(t), 'Set Up: 2 Of 5 Done at the top');
    check(['F10 Notification', 'Asbestos Register', 'Construction Phase Plan', 'Site Rules', 'Induction Form'].every((x) => t.includes(x)), 'the five set-up items are listed');
    check(/Before Work/.test(t) && /People/.test(t) && /On Site/.test(t), 'three tabs: Before Work, People, On Site');
    check(/Site Rules & Layout/.test(t) && !/Programme/.test(t) && !/Permits To Work/.test(t), 'Before Work has the plan, F10, Asbestos and Site Rules; no Programme tile');
    await page.screenshot({path: path.join(SHOTS, 'mc-before-laptop.png')});
    await tab(page, 'People'); await page.waitForTimeout(2500);
    t = await body(page);
    check(/Subcontractors/.test(t) && /Site Inductions/.test(t) && /Everyone On This Job/.test(t), 'People: subcontractors, inductions and everyone on the job');
    check(/Jake Morris[\s\S]{0,40}Inducted ✓[\s\S]{0,20}Site Rules ✓/.test(t), 'a person who has done both: Inducted ✓ and Site Rules ✓ on one row');
    check(/Ray Painter[\s\S]{0,60}Pro Finish Decorators Ltd[\s\S]{0,30}Not Inducted/.test(t), 'a subcontractor\'s operative shows their company and Not Inducted');
    await page.screenshot({path: path.join(SHOTS, 'mc-people-laptop.png')});
    await tab(page, 'On Site'); await page.waitForTimeout(2000);
    t = await body(page);
    check(/Permits To Work/.test(t) && /1 open/.test(t) && /Inspections/.test(t), 'On Site: permits (1 open) and inspections');
    // Show the plan to operatives from its ⋮.
    await tab(page, 'Before Work'); await page.waitForTimeout(1500);
    await page.getByLabel('More for Construction Phase Plan').click(); await page.waitForTimeout(800);
    await page.getByText('👁 Show To Operatives', {exact: true}).last().click(); await page.waitForTimeout(1500);
    check((site.mc_shown_tiles || []).includes('cpp'), `the ⋮ shows the plan to operatives (${JSON.stringify(site.mc_shown_tiles)})`);
    t = await body(page);
    check(/shown to operatives/.test(t), 'the row says it is shown to operatives');
    // A subcontractor's page: four tabs.
    await page.goto(B + `/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
    t = await body(page);
    check(['Documents', 'Work', 'People', 'Handover'].every((x) => t.includes(x)) && /RAMS/.test(t) && /Toolbox Talks/.test(t) && /Daily Briefings/.test(t), 'subcontractor page: Documents / Work / People / Handover, Documents first');
    await page.screenshot({path: path.join(SHOTS, 'sub-docs-laptop.png')});
    await tab(page, 'Work'); await page.waitForTimeout(1500);
    t = await body(page);
    check(/Schedule of Works/.test(t) && /Snags/.test(t) && /Permits To Work/.test(t), 'Work: Schedule of Works, Snags, Permits');
    await tab(page, 'People'); await page.waitForTimeout(1500);
    t = await body(page);
    check(/Operatives/.test(t) && /Project Manager/.test(t) && /Ray Painter/.test(t), 'People: operatives and their Project Manager by name');
    await tab(page, 'Handover'); await page.waitForTimeout(1500);
    t = await body(page);
    check(/Close-Out/.test(t) && /O&M Manual/.test(t), 'Handover: close-out and O&M');
    // Admin: one Main Contractor tab.
    await page.goto(B + '/pm/admin/companylibrary'); await page.waitForTimeout(5000);
    t = await body(page);
    check(['Main Contractor', 'CPP Template', 'Site Rules Template', 'Induction Form', 'Subcontractor Library', 'Inspection Templates'].every((x) => t.includes(x)), 'Admin › Main Contractor: CPP Template, Site Rules Template, Induction Form, Subcontractor Library, Inspection Templates');
    check(/Sign-Up Form & Applications/.test(t), 'sign-ups inside the Subcontractor Library');
    await page.screenshot({path: path.join(SHOTS, 'admin-mc-laptop.png')});
    await page.getByText('Inspection Templates', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(2500);
    check(/kind=mc/.test(page.url()) && /The inspections on a Main Contractor job/.test(await body(page)), 'Inspection Templates opens just the Main Contractor ones');
    // On a phone: the Main Contractor page and the admin tabs.
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(B + `/sites/${S1}/mc`); await page.waitForTimeout(5000);
    await page.screenshot({path: path.join(SHOTS, 'mc-phone.png')});
    await page.goto(B + '/pm/admin/inductionform'); await page.waitForTimeout(5000);
    await page.screenshot({path: path.join(SHOTS, 'admin-mc-phone.png')});
    await ctx.close();
  }

  // ---- An operative on a phone ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    const {site} = seed(db, 'operative');
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await signIn(page);
    await page.goto(B + `/sites/${S1}/mc`); await page.waitForTimeout(5000);
    let t = await body(page);
    check(/My Induction/.test(t) && /To do · before you start/.test(t) && /Permits To Sign/.test(t) && /1 to sign/.test(t), 'an operative sees My Induction (to do) and Permits To Sign (1)');
    check(!/Construction Phase Plan|Asbestos Register|F10 Notification|Subcontractors|Set Up:/.test(t), 'and nothing else');
    await page.screenshot({path: path.join(SHOTS, 'mc-operative-phone.png')});
    await page.goto(B + `/sites/${S1}/mc/docs/cpp`); await page.waitForTimeout(5000);
    check(!/\/mc\/docs\/cpp/.test(page.url()), `the plan can't be opened by link (${page.url().replace(B, '')})`);
    site.mc_shown_tiles = ['cpp'];
    await page.goto(B + `/sites/${S1}/mc`); await page.waitForTimeout(5000);
    t = await body(page);
    check(/Construction Phase Plan/.test(t), 'once a manager shows it, the operative sees the plan');
    await ctx.close();
  }

  // ---- Get Going: a new company's admin ----
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: []});
    db.organizations[0].logo_path = null; db.organizations[0].has_finance = true;
    db.site_assignments = []; db.checkins = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await signIn(page);
    check(!/\/pm\/admin\/branding/.test(page.url()), `no logo: not kept on the logo page (${page.url().replace(B, '')})`);
    let t = await body(page);
    check(/Get Going · 2 Of 4 Done/.test(t), 'Home: Get Going · 2 Of 4 Done');
    check(['Add Your First Job', 'Invite Your Team', 'Put Them On The Job', 'Check In Once'].every((x) => t.includes(x)), 'the four steps');
    check(/Later · \d+ Of \d+ Done/.test(t) && !/Add Your Logo And Colours/.test(t), 'the rest waits under Later');
    await page.screenshot({path: path.join(SHOTS, 'getgoing-phone.png')});
    await page.getByText(/^Later · /).first().click(); await page.waitForTimeout(800);
    t = await body(page);
    check(/Add Your Logo And Colours/.test(t) && /Link OneDrive/.test(t) && /Set Up Finance/.test(t), 'Later opens: logo, OneDrive, … Finance');
    await page.getByRole('button', {name: 'Put Them On The Job', exact: true}).click(); await page.waitForTimeout(4000);
    check(/\/sites\/[0-9a-f-]+$/.test(page.url()), `Put Them On The Job opens the first job (${page.url().replace(B, '')})`);
    await page.goto(B + '/pm/admin/branding'); await page.waitForTimeout(4000);
    t = await body(page);
    check(/whenever you're ready/.test(t) && /OpHUB colours/.test(t) && !/Add your logo to carry on/.test(t), 'the logo page is a reminder, not a lock');
    await ctx.close();
  }

  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
