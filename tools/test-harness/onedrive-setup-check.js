// OneDrive set-up (Andy, 8 Nov 2026), on the fake database, laptop: Admin › OneDrive — the connection, New Jobs (a folder for
// every new job? where they go, the template, chosen by browsing OneDrive), Where Things Save (Projects / Finance / Company,
// folder changed from the template's folders, Yes / No, + Add Something To Save); Finance › Settings › OneDrive opens the
// same page on the Finance tab; Finance › Directory: a client set to no OneDrive folders; Add a Project: the "Create OneDrive
// folder" tick (unticked for that client, ticked again for one job, and the job pack runs only when ticked); the super
// admin's Setting Up The Company steps. node onedrive-setup-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const ROOT = [{id: 'f-rtb', name: 'RTB Roofing Ltd', driveId: 'd1'}, {id: 'f-docs', name: 'Documents', driveId: 'd1'}];
const IN_RTB = [{id: 'f-live', name: 'Live Projects', driveId: 'd1'}, {id: 'f-arch', name: 'Archive', driveId: 'd1'}];
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id; db.organizations[0].has_finance = true; db.profiles[0].finance_enabled = true;
  db.onedrive_connections = [{org_id: O, account_email: 'andy@rtb.example', connected_at: '2026-11-08T21:24:00Z'}];
  // The job pack as RTB has it today: the starting set, switched on.
  const PROG = '5. OpHUB x Photos & Inspections/1. Progress Reports (Safety Culture)';
  db.job_pack_settings = [{org_id: O, enabled: true, config: {
    parent_path: 'RTB Roofing Ltd/Live Projects', template_path: 'RTB Roofing Ltd/Live Projects/- New Job Pack - Template',
    folders: ['2. Health & Safety', '2. Health & Safety/1. RAMS', '2. Health & Safety/2. COSHH', '2. Health & Safety/3. Toolbox Talks', '1. Contract & Commercial', '1. Contract & Commercial/4. Applications for Payment & Certificates', '5. OpHUB x Photos & Inspections', PROG, `${PROG}/1. Pre Start`],
    files: [], weekly: {name: '{order}. Week {n}', addDate: false, weekStart: 1, week1: 'start'},
    rules: {rams_issued: {on: true, folder: '2. Health & Safety/1. RAMS'}, tbt_issued: {on: true, folder: '2. Health & Safety/3. Toolbox Talks'}, sow_prestart: {on: true, folder: `${PROG}/1. Pre Start`}, incident: {on: false, folder: '2. Health & Safety'}},
  }}];
  db.fin_clients = [{id: 'c1', org_id: O, name: 'Sovereign Housing', email: 'repairs@sovereign.example', onedrive_folders: true}, {id: 'c2', org_id: O, name: 'Bellway Homes', email: 'a@bellway.example', onedrive_folders: true}];
  const fns = [];
  global.__fn = (name, b) => {
    fns.push([name, b]);
    if (name === 'onedrive-list-folders') return {folders: !b.parent_id ? ROOT : b.parent_id === 'f-rtb' ? IN_RTB : []};
    if (name === 'onedrive-job-pack') return {ok: true, path: 'x', made: 3, copied: 0, failed: []};
    return {ok: true};
  };
  global.__rpc = (n, b) => {
    if (n === 'onedrive_status') return {exists: true, connected: true, needs_reconnect: false, account_email: 'andy@rtb.example'};
    if (n === 'client_onedrive_folders') { const c = db.fin_clients.find((x) => x.name.toLowerCase() === String(b.p_name || '').trim().toLowerCase()); return !c || c.onedrive_folders !== false; }
    return undefined;
  };
  const cfg = () => db.job_pack_settings[0].config;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Admin › OneDrive ----
  await page.goto(`${BASE}/pm/admin/onedrive`); await page.waitForTimeout(5000);
  let t = await text();
  check(/Connected/.test(t) && /andy@rtb\.example/.test(t), 'the connection');
  check(/Create A OneDrive Folder For Every New Job\?/.test(t) && /RTB Roofing Ltd › Live Projects/.test(t) && /New Job Pack - Template/.test(t), 'New Jobs: the question, where they go, the template');
  check(/WHERE THINGS SAVE/.test(t) && /Job › 2\. Health & Safety › 1\. RAMS/.test(t) && /Not Saving/.test(t), 'Where Things Save: each item’s folder, and one not saving');
  await page.screenshot({path: 'shots/od-page.png', fullPage: true});
  // Change where RAMS save: Toolbox Talks' folder, from the template's folders.
  await page.getByLabel('Folder: Job › 2. Health & Safety › 1. RAMS').click(); await page.waitForTimeout(700);
  await page.screenshot({path: 'shots/od-folder-pop.png'});
  await page.getByLabel('Open 3. Toolbox Talks').click(); await page.waitForTimeout(300);
  await page.getByText('Use “3. Toolbox Talks”', {exact: true}).click(); await page.waitForTimeout(1500);
  check(cfg().rules.rams_issued.folder === '2. Health & Safety/3. Toolbox Talks', `RAMS now save in Toolbox Talks (${cfg().rules.rams_issued.folder})`);
  // Turn toolbox talks off.
  await page.getByLabel('Talk issued on this job: No').click(); await page.waitForTimeout(1500);
  check(cfg().rules.tbt_issued.on === false, 'No: toolbox talks stop saving');
  // Where new job folders go: browse OneDrive.
  await page.getByLabel('Folder: 📁 RTB Roofing Ltd › Live Projects', {exact: true}).click(); await page.waitForTimeout(1500);
  await page.getByLabel('Open RTB Roofing Ltd').click(); await page.waitForTimeout(1500);
  await page.getByLabel('Open Archive').click(); await page.waitForTimeout(1200);
  await page.getByText('Use “Archive”', {exact: true}).click(); await page.waitForTimeout(1500);
  check(cfg().parent_path === 'RTB Roofing Ltd/Archive', `New job folders: chosen by browsing OneDrive (${cfg().parent_path})`);
  // Finance tab: + Add Something To Save.
  await page.getByText('Finance', {exact: true}).last().click(); await page.waitForTimeout(600);
  t = await text();
  check(/Purchase Orders/.test(t) && await page.getByText('+ Add Something To Save', {exact: true}).count() === 1, 'Finance tab: POs shown, and + Add Something To Save');
  await page.getByText('+ Add Something To Save', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByLabel('What', {exact: true}).click(); await page.waitForTimeout(400);
  await menu('Applications For Payment: Application PDF Made').click(); await page.waitForTimeout(400);
  await page.screenshot({path: 'shots/od-add.png'});
  await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(cfg().rules.fin_application && cfg().rules.fin_application.on === true && /Applications for Payment/.test(cfg().rules.fin_application.folder), 'added: applications save into the job’s Applications folder');
  check(/Application PDF Made/.test(await text()), 'and it’s on the Finance list');
  await page.getByText('Company', {exact: true}).last().click(); await page.waitForTimeout(500);
  t = await text();
  check(/Operative Certificates/.test(t) && /Exports Not For A Job/.test(t) && /Company Exports/.test(t), 'Company tab: where company-wide things go');
  // A folder for every new job? No.
  await page.getByLabel('Create a OneDrive folder for every new job: No').click(); await page.waitForTimeout(1500);
  check(cfg().create_new === false, 'New Jobs: No stops folders being made for every new job');
  await page.getByLabel('Create a OneDrive folder for every new job: Yes').click(); await page.waitForTimeout(1500);

  // ---- Finance › Settings › OneDrive ----
  await page.goto(`${BASE}/fin/onedrive`); await page.waitForTimeout(4500);
  check(/WHERE THINGS SAVE/.test(await text()) && /Application PDF Made/.test(await text()), 'Finance › OneDrive: the same page, on the Finance tab');

  // ---- Directory: a client with no folders ----
  await page.goto(`${BASE}/fin/directory`); await page.waitForTimeout(5000);
  await page.getByText('Sovereign Housing', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.getByLabel('Create OneDrive Folders For This Client’s Jobs?').click(); await page.waitForTimeout(400);
  await menu('No').click(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/od-client.png'});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.fin_clients.find((c) => c.id === 'c1').onedrive_folders === false, 'Directory: Sovereign Housing set to no OneDrive folders');
  check(/No OneDrive Folders/.test(await text()), 'shown on the client list');

  // ---- Add a Project ----
  await page.goto(`${BASE}/sites/new`); await page.waitForTimeout(4500);
  check(await page.getByText('Create OneDrive folder', {exact: true}).count() === 1, 'Add a Project: a Create OneDrive folder tick');
  await page.getByPlaceholder('Start typing — clients from the Directory come up').fill('Sovereign Housing'); await page.waitForTimeout(1500);
  t = await text();
  check(/is set to no OneDrive folders in the Directory/.test(t), 'for Sovereign Housing it starts unticked, and says why');
  await page.screenshot({path: 'shots/od-newproject.png'});
  const fill = async (label, v) => { await page.locator(`text="${label}"`).first().locator('xpath=following::input[1]').fill(v); };
  await fill('Site name *', 'Oak House'); await fill('Address *', 'Oak House, Banbury'); await fill('Job number', 'J201');
  await page.getByText('Active', {exact: true}).first().click();
  await page.getByText('Choose a date', {exact: true}).first().click(); await page.waitForTimeout(500); await page.locator('text="16" >> visible=true').last().click(); await page.waitForTimeout(400);
  const before = fns.filter(([n, b]) => n === 'onedrive-job-pack' && b.action === 'setup').length;
  await page.getByText('Create Project', {exact: true}).click(); await page.waitForTimeout(3500);
  const made = db.sites.find((s) => s.name === 'Oak House');
  check(!!made && fns.filter(([n, b]) => n === 'onedrive-job-pack' && b.action === 'setup').length === before, `unticked: the job is made with no folder (${made ? 'made' : 'not made'})`);
  await page.goto(`${BASE}/sites/new`); await page.waitForTimeout(4000);
  await page.getByPlaceholder('Start typing — clients from the Directory come up').fill('Bellway Homes'); await page.waitForTimeout(1200);
  await fill('Site name *', 'Elm Court'); await fill('Address *', 'Elm Court, Oxford'); await fill('Job number', 'J202');
  await page.getByText('Active', {exact: true}).first().click();
  await page.getByText('Choose a date', {exact: true}).first().click(); await page.waitForTimeout(500); await page.locator('text="16" >> visible=true').last().click(); await page.waitForTimeout(400);
  await page.getByText('Create Project', {exact: true}).click(); await page.waitForTimeout(3500);
  const e2 = db.sites.find((s) => s.name === 'Elm Court');
  check(!!e2 && fns.some(([n, b]) => n === 'onedrive-job-pack' && b.action === 'setup' && b.site_id === e2.id), 'ticked (Bellway): the job’s folder is made from the template');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();

  // ---- Super admin: Setting Up The Company ----
  const b2 = await chromium.launch(); const errs2 = [];
  const S = await makeContext(b2, 'superadmin', [], {viewport: {width: 1366, height: 900}}); seed(S.db);
  S.db.profiles[0].role = 'superadmin'; S.db.profiles[0].howto_dismissed = ['*'];
  S.db.organizations.push({id: 'org-h', name: 'Hughes Roofing Ltd', has_pm: true, has_finance: true, plan_tier: 'growth', created_at: '2026-11-08T09:00:00Z'});
  S.db.profiles.push({id: 'dan', name: 'Dan Hughes', role: 'admin', org_id: 'org-h', email: 'dan@hughes.example'});
  global.__rpc = (n) => (n === 'platform_setup_status' ? {admins: 1, onedrive: true, pack_on: false, parent_path: null, template_path: null, rules_on: 0, clients_off: 0, jobs_with_folder: 0} : undefined);
  const p2 = await S.ctx.newPage(); p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto(BASE + '/login'); await p2.waitForTimeout(4000);
  await p2.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await p2.fill('input[type="password"]', 'pw123456');
  await p2.getByText('Sign In', {exact: true}).click(); await p2.waitForTimeout(6000);
  const h = p2.getByText('Hughes Roofing Ltd', {exact: true});
  if (await h.count()) {
    await h.first().click(); await p2.waitForTimeout(2000);
    const t2 = (await p2.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/Setting Up The Company/.test(t2) && /Connect Their OneDrive/.test(t2) && /Choose Their Folders/.test(t2) && /Test Job/.test(t2) && /Open Their OneDrive Settings/.test(t2), 'super admin: Setting Up The Company, each step ticked from what’s there');
    await p2.getByText('Open Their OneDrive Settings ›', {exact: true}).scrollIntoViewIfNeeded(); await p2.waitForTimeout(500);
    await p2.screenshot({path: 'shots/od-platform.png'});
  } else check(false, 'super admin: the company list');
  check(!errs2.length, `super admin: no page errors ${errs2.slice(0, 3).join(' | ')}`);
  await b2.close();
})();
