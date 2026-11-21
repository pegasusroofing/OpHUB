// HR Access (Andy, 15 Nov 2026): "each pm etc has hr to book holiday, has the folders we created, but only they can see
// their folder, and then the admin sets who else can see it ... I can also allow pm 1 to see estimator 1 and pm 3 (as
// that's their team, but I don't want to group by team just individual)", and the HR folder in OneDrive "where access is
// managed".
// Compact (Andy, 15 Nov 2026: grouped by role, tap someone for a pop-up of who and what they see); 16 Nov: grouped under
// the company's own roles, each person someone sees with their own parts (hr_set_person_access_each). The company admin: grouped by role; Paul Planner sees Jake Morris and Dave Price (Licences & Cards too); Tom Hughes sees everyone's; switching company admins off asks first. Before that: Who Sees Everyone's Folders; Who
// Can See Whose Folder, person by person (Paul Planner allowed Jake Morris and Dave Price); the HR folder (a folder
// already used in OpHUB refused; who can open it shown; Copy All Now); the change log; the HR folder can't be picked for
// anything else. A PM allowed to see Jake: HR (holiday, policies), their own folder and Jake's (the parts HR allows), not
// Tom's; HR Access read-only. An operative's own record says who can see it. A Finance Controller has HR in the menu.
// The fake back end plays the database (the real rules are proven in SQL: docs/claude-code/sql/hr-viewers-15nov.sql and
// hr-folder-lock-15nov.sql) and the OneDrive functions (the lock itself: app-native/src/lib/rules/hrLock.test.ts).
// node hr15-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'hr15');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const emptyHr = (db) => { db.hr_records = []; db.hr_docs = []; db.hr_history = []; db.hr_goals = []; db.hr_feedback = []; db.hr_appraisals = []; db.hr_bonuses = []; db.hr_team = []; };

// The database's HR functions, played here.
const S = {set_up: false, admins: null, pms: null, at: null, by: null, onedrive: null, named: [], log: [], lm: null, grants: []};
let ME = null, DB = null;
const staffOf = () => DB.profiles.filter((p) => p.org_id === DB.organizations[0].id && !['client', 'superadmin'].includes(p.role) && !String(p.role).startsWith('subcontractor'));
const nameOf = (id) => (DB.profiles.find((p) => p.id === id) || {}).name || id;
const who = () => {
  const adm = S.set_up ? !!S.admins : true, pms = !!S.pms;
  const people = staffOf().map((p) => ({id: p.id, name: p.name, role: p.role, why: [S.named.includes(p.id) && 'named', adm && p.role === 'admin' && 'admin', pms && p.role === 'pm' && 'pm'].filter(Boolean)}))
    .filter((x) => x.why.length).sort((a, b) => a.name.localeCompare(b.name));
  const boss = people.some((p) => p.id === ME.id) || ME.role === 'admin';
  return {set_up: S.set_up, team_admins: adm, team_pms: pms, named: S.named, people, set_up_at: S.at, set_up_by: S.by, log: boss ? S.log : [],
    grants: boss ? S.grants : [], sees_mine: S.grants.filter((g) => g.user_id === ME.id).map((g) => ({id: g.viewer_id, name: nameOf(g.viewer_id)}))};
};
const onTeam = () => who().people.some((p) => p.id === ME.id);
const stamp = (what) => S.log.unshift({at: new Date().toISOString(), by: ME.name, what});
const fnCalls = [];
const setFakes = () => {
  global.__rpc = (name, b) => {
    if (name === 'hr_my_access') return {team: onTeam(), team_set: S.set_up, lm_sections: S.lm || ['performance', 'emergency'], appraisal_months: 12, onedrive: onTeam() ? S.onedrive : null};
    if (name === 'hr_who_has_access') return who();
    if (name === 'hr_save_team') {
      if (!onTeam()) return {__status: 400, body: {message: 'HR team only'}};
      Object.assign(S, {set_up: true, admins: b.p_admins, pms: b.p_pms, named: b.p_people || []}); S.at = S.at || new Date().toISOString(); S.by = S.by || ME.name;
      stamp(`All Company Admins: ${b.p_admins ? 'Yes' : 'No'}.`); return who();
    }
    if (name === 'hr_set_viewer_access') {
      if (!onTeam()) return {__status: 400, body: {message: 'HR team only'}};
      S.grants = S.grants.filter((g) => g.viewer_id !== b.p_viewer).concat((b.p_people || []).map((u) => ({viewer_id: b.p_viewer, user_id: u})));
      stamp(`${nameOf(b.p_viewer)} can see the folders of ${(b.p_people || []).map(nameOf).sort().join(', ')}.`); return true;
    }
    if (name === 'hr_set_person_access') {
      if (!onTeam()) return {__status: 400, body: {message: 'HR team only'}};
      S.set_up = true; if (S.admins === null) S.admins = true;
      S.named = b.p_everyone ? [...new Set([...S.named, b.p_viewer])] : S.named.filter((x) => x !== b.p_viewer);
      S.grants = S.grants.filter((g) => g.viewer_id !== b.p_viewer).concat((b.p_people || []).map((u) => ({viewer_id: b.p_viewer, user_id: u, sections: b.p_sections})));
      stamp(`${nameOf(b.p_viewer)}: ${b.p_everyone ? 'sees everyone’s folders' : 'sees the folders of ' + (b.p_people || []).map(nameOf).sort().join(', ')}.`); return true;
    }
    if (name === 'hr_set_person_access_each') {
      if (!onTeam()) return {__status: 400, body: {message: 'HR team only'}};
      const gs = b.p_everyone ? [] : (b.p_grants || []);
      if (gs.some((x) => !(x.sections || []).length)) return {__status: 400, body: {message: 'Choose at least one part'}};
      S.set_up = true; if (S.admins === null) S.admins = true;
      S.named = b.p_everyone ? [...new Set([...S.named, b.p_viewer])] : S.named.filter((x) => x !== b.p_viewer);
      S.grants = S.grants.filter((g) => g.viewer_id !== b.p_viewer).concat(gs.map((x) => ({viewer_id: b.p_viewer, user_id: x.user_id, sections: x.sections})));
      stamp(`${nameOf(b.p_viewer)}: ${b.p_everyone ? 'sees everyone’s folders' : 'sees the folders of ' + gs.map((x) => nameOf(x.user_id)).sort().join(', ')}.`); return true;
    }
    if (name === 'hr_sections_for') { const g = S.grants.find((x) => x.viewer_id === ME.id && x.user_id === b.p_user); return g ? (g.sections && g.sections.length ? g.sections : ['performance', 'emergency']) : []; }
    if (name === 'hr_save_settings') {
      if (b.p_onedrive && b.p_onedrive.id === 'USED1') return {__status: 400, body: {code: 'P0001', message: 'linked_elsewhere'}};
      if (b.p_lm_sections) S.lm = b.p_lm_sections;
      if (b.p_clear_onedrive) { S.onedrive = null; stamp('HR folder in OneDrive removed.'); } else if (b.p_onedrive) { const fresh = !S.onedrive || S.onedrive.id !== b.p_onedrive.id; S.onedrive = b.p_onedrive; stamp(fresh ? `HR folder in OneDrive set to "${b.p_onedrive.name}".` : 'Copying changed.'); }
      return true;
    }
    if (name === 'hr_my_reports') return S.grants.filter((g) => g.viewer_id === ME.id).map((g) => ({user_id: g.user_id, job_title: null}));
    if (name === 'hr_basic') return S.grants.some((g) => g.viewer_id === ME.id && g.user_id === b.p_user) ? {user_id: b.p_user, job_title: 'Roofer'} : null;
    return undefined;
  };
  global.__fn = (name, b) => {
    fnCalls.push({name, b});
    if (name === 'onedrive-list-folders') {
      if (!b.parent_id && !b.shared && !b.companySites) return {folders: [{id: 'USED1', name: 'Jobs', driveId: 'D1'}, {id: 'NEW1', name: 'HR Private', driveId: 'D1'}]};
      return {folders: [], files: []};
    }
    if (name === 'hr-onedrive-copy' && b.action === 'access') return {ok: true, folder: {name: 'HR Private', webUrl: 'https://example.test/hr'}, account: 'office@rtb.test',
      shared: [{who: 'Andy Cramp', email: 'andy@rtb.test', how: 'Owner', kind: 'person', warn: false, inherited: false}, {who: 'Anyone With The Link', how: 'Can View', kind: 'link', warn: true, inherited: false}]};
    if (name === 'hr-onedrive-copy' && b.all) return {ok: true, copied: 3};
    return undefined;
  };
};
// Presses the Change button on someone's row in Who Can See Whose Folder.
const pressChange = (page, name) => page.evaluate((n) => {
  const rows = [...document.querySelectorAll('div')].filter((d) => d.innerText && d.innerText.startsWith(n + ' ·') && /\nChange$/.test(d.innerText.trim()));
  const row = rows.sort((a, b) => a.innerText.length - b.innerText.length)[0];
  if (!row) return false;
  const btn = [...row.querySelectorAll('div')].find((d) => d.innerText === 'Change' && !d.children.length);
  (btn.closest('[role="button"]') || btn).click(); return true;
}, name);

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---------- the company admin ----------
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  DB = db; ME = db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id;
  if (!db.profiles.some((p) => p.id === 'pmx9')) db.profiles.push({id: 'pmx9', name: 'Paul Planner', role: 'pm', org_id: O, email: 'pp@x.co'});
  emptyHr(db);
  setFakes();
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const dupKeys = []; page.on('console', (m) => { if (/same key/.test(m.text())) dupKeys.push(m.text().slice(0, 160)); });
  const body = () => page.evaluate(() => document.body.innerText);
  await login(page);
  await page.goto(B + '/pm/hr'); await page.waitForTimeout(3500);
  let t = await body();
  check(/Holiday calendar/.test(t) && /Employee Records/.test(t) && /Company policies/.test(t), 'HR: holiday calendar, employee records, company policies');
  await page.goto(B + '/pm/hr/records'); await page.waitForTimeout(4000);
  t = await body();
  check(/Every company admin sees everyone’s folders/.test(t) && /Paul Planner/.test(t) && /Jake Morris/.test(t) && /Tom Hughes/.test(t), 'the admin sees everyone’s folder; every company admin does, to start');
  await page.getByLabel('HR Access', {exact: true}).click(); await page.waitForTimeout(3500);
  t = await body();
  check(/Who Can See What/.test(t) && /\nAdmin\n/.test(t) && /\nProject Manager\n/.test(t) && /Operative · 2/.test(t), 'grouped under the company’s roles (16 Nov), operatives folded with how many');
  check(/Paul Planner/.test(t) && /Own Folder Only/.test(t) && /Sees Everyone/.test(t) && !/Jake Morris/.test(t), 'one line each (admins: Sees Everyone; others: Own Folder Only); operatives folded away');
  check(!/Who Sees Everyone’s Folders/.test(t) && !/Who Can See Whose Folder/.test(t) && !/Through OpHUB/.test(t), 'compact: no long sections on the page');
  await page.screenshot({path: path.join(SHOTS, 'hr-access-start.png'), fullPage: true});

  // Tap Paul Planner: add Jake Morris and Dave Price, parts: Licences & Cards as well.
  await page.getByLabel('Paul Planner: Own Folder Only', {exact: true}).click(); await page.waitForTimeout(1500);
  t = await body();
  check(/Paul Planner · Project Manager/.test(t) && /Sees Everyone’s Folders/.test(t) && /Whose Folders They Can See/.test(t) && /Who Can See Paul’s Folder/.test(t), 'the pop-up: sees everyone’s, whose folders, who sees his');
  await page.getByLabel('Add Someone', {exact: true}).last().click(); await page.waitForTimeout(600); await page.getByText('Jake Morris · Operative', {exact: true}).last().click(); await page.waitForTimeout(500);
  await page.getByLabel('Add Someone', {exact: true}).last().click(); await page.waitForTimeout(600); await page.getByText('Dave Price · Project Manager', {exact: true}).last().click(); await page.waitForTimeout(500);
  t = await body();
  check(/Jake Morris · Operative/.test(t) && /Dave Price · Project Manager/.test(t) && /Licences & Cards/.test(t) && /Disciplinary & Grievance/.test(t) && /Payslips & Pay/.test(t), 'each person added has their own parts, contracts, pay, right to work, disciplinary and bonus included (16 Nov)');
  await page.getByLabel('Dave Price: Licences & Cards: Yes', {exact: true}).last().click(); await page.waitForTimeout(300);
  await page.screenshot({path: path.join(SHOTS, 'hr-viewer-pop.png')});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const g = S.grants.filter((x) => x.viewer_id === 'pmx9');
  const gd = g.find((x) => x.user_id !== 'o1') || {}, gj = g.find((x) => x.user_id === 'o1') || {};
  check(g.length === 2 && (gd.sections || []).includes('licences') && (gd.sections || []).includes('performance') && !(gj.sections || []).includes('licences') && !(gd.sections || []).includes('conduct'), `saved: Jake Morris, and Dave Price with Licences & Cards too, each their own (${JSON.stringify(g)})`);
  check(/Jake Morris, Dave Price/.test(await body()), 'his line now names them');

  // A company admin sees everyone's through the switch at the top: the pop-up says so and has nothing to save.
  await page.getByLabel(ME.name + ': Sees Everyone', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await body();
  const saveBtns = await page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => !d.children.length && d.innerText === 'Save' && d.getBoundingClientRect().width > 0).length);
  check(/Yes, as a company admin \(set under Settings below\)/.test(t) && saveBtns === 0, 'a company admin’s pop-up says why, with nothing to save');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);
  // Tom Hughes sees everyone's (operatives opened first).
  await page.getByLabel('Operative: show', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByLabel('Tom Hughes: Own Folder Only', {exact: true}).click(); await page.waitForTimeout(1200);
  await page.getByLabel('Sees Everyone’s Folders: Yes', {exact: true}).last().click(); await page.waitForTimeout(300);
  check(!/Whose Folders They Can See/.test(await body()), 'Yes to everyone’s hides the person-by-person part');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  check(S.named.includes('o2'), 'saved: Tom Hughes sees everyone’s folders');

  // Switching company admins off asks first; No changes nothing.
  await page.getByLabel('Company Admins See Everyone’s Folders: No', {exact: true}).click(); await page.waitForTimeout(1200);
  check(/Switch this off\?/.test(await body()), 'switching company admins off asks first');
  await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(S.admins !== false, 'No: nothing changed');

  // What line managers see, and the changes, each in a pop-up.
  await page.getByLabel('What Line Managers See', {exact: true}).click(); await page.waitForTimeout(1200);
  await page.getByLabel('Job History: Yes', {exact: true}).last().click(); await page.waitForTimeout(1200);
  check((S.lm || []).includes('history'), 'What Line Managers See: Job History saved');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.getByLabel('Changes', {exact: true}).click(); await page.waitForTimeout(1200);
  check(/Changes To HR Access/.test(await body()) && /Paul Planner: sees the folders of/.test(await body()), 'Changes: who changed what');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);

  // ---------- the HR folder ----------
  await page.getByLabel('HR Folder In OneDrive', {exact: true}).click(); await page.waitForTimeout(1500);
  await page.getByText('Choose The HR Folder', {exact: true}).click(); await page.waitForTimeout(3500);
  t = await body();
  check(/Choose The HR Folder/.test(t) && /HR Private/.test(t) && !/Quick Link/.test(t), 'the picker opens, with no Quick Link pinning for the HR folder');
  await page.getByText('📁 Jobs', {exact: true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Use "Jobs"', {exact: true}).click(); await page.waitForTimeout(1500);
  check((await body()).includes('Is "Jobs" only for HR?'), 'choosing the HR folder asks first: everything inside it gets hidden from everyone else');
  await page.getByText('Yes, Use It', {exact: true}).click(); await page.waitForTimeout(2000);
  check(/already used in OpHUB/.test(await body()), 'a folder already used in OpHUB is refused, with why');
  await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.getByText('‹ Up One Level', {exact: true}).click(); await page.waitForTimeout(2000);
  await page.getByText('📁 HR Private', {exact: true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Use "HR Private"', {exact: true}).click(); await page.waitForTimeout(1500);
  await page.getByText('Yes, Use It', {exact: true}).click(); await page.waitForTimeout(4000);
  check(S.onedrive && S.onedrive.id === 'NEW1' && S.onedrive.on === true, 'a new folder is linked');
  check(/📁 HR Private/.test(await body()), 'its line on HR Access shows the folder');
  await page.getByLabel('HR Folder In OneDrive', {exact: true}).click(); await page.waitForTimeout(2500);
  t = await body();
  check(/Through OpHUB/.test(t) && /In OneDrive itself/.test(t) && /Andy Cramp/.test(t) && /⚠ Anyone With The Link/.test(t) && /office@rtb\.test/.test(t), 'the folder pop-up: who can open it (link flagged, company sign-in)');
  await page.getByText('Copy All Now', {exact: true}).click(); await page.waitForTimeout(2000);
  check(/3 documents copied/.test(await body()), 'Copy All Now copies, and says how many');
  await page.screenshot({path: path.join(SHOTS, 'hr-folder-pop.png')});
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.screenshot({path: path.join(SHOTS, 'hr-access-laptop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844}); await page.waitForTimeout(1500);
  await page.screenshot({path: path.join(SHOTS, 'hr-access-phone.png'), fullPage: true});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'phone: nothing runs off the side');
  await page.getByLabel('Paul Planner: Jake Morris, Dave Price', {exact: true}).click(); await page.waitForTimeout(1500);
  await page.screenshot({path: path.join(SHOTS, 'hr-viewer-pop-phone.png')});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'phone: the person pop-up fits');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/pm/onedrive-pick?target=progress&id=s1'); await page.waitForTimeout(3500);
  await page.getByText('📁 HR Private', {exact: true}).click(); await page.waitForTimeout(2500);
  t = await body();
  check(/This is the HR folder/.test(t) && !/Use "HR Private"/.test(t) && !/Pin as a Quick Link/.test(t), 'picking a folder for a project: the HR folder can’t be used or pinned');
  check(!dupKeys.length, 'no repeated list keys' + (dupKeys.length ? ': ' + dupKeys[0] : ''));
  await ctx.close();

  // ---------- a PM allowed to see Jake Morris ----------
  S.grants = [{viewer_id: 'me', user_id: 'o1', sections: ['performance', 'licences']}];
  const p2 = await makeContext(browser, 'pm', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(p2.db);
  DB = p2.db; ME = p2.db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {role: 'pm', howto_dismissed: ['*']});
  emptyHr(p2.db);
  const pg2 = await p2.ctx.newPage(); pg2.on('pageerror', (e) => errs.push(e.message));
  await login(pg2);
  await pg2.goto(B + '/pm/hr'); await pg2.waitForTimeout(3500);
  t = await pg2.evaluate(() => document.body.innerText);
  check(/Holiday calendar/.test(t) && /Company policies/.test(t) && /anyone HR lets you see/.test(t), 'a PM has HR: holiday, policies, their folder and anyone HR lets them see');
  await pg2.goto(B + '/pm/hr/records'); await pg2.waitForTimeout(4000);
  t = await pg2.evaluate(() => document.body.innerText);
  check(/Jake Morris/.test(t) && /You Can See/.test(t) && !/Tom Hughes/.test(t) && !/HR Access/.test(t), 'Employee Records: their own and Jake’s, not Tom’s, no HR Access');
  await pg2.getByText('Jake Morris', {exact: true}).first().click(); await pg2.waitForTimeout(4000);
  t = await pg2.evaluate(() => document.body.innerText);
  check(!/private to/.test(t) && /Performance/.test(t) && !/Bonus/.test(t), 'Jake’s folder opens for them, with only the parts HR allows (no Bonus)');
  await pg2.getByText('Performance', {exact: true}).first().click(); await pg2.waitForTimeout(1500);
  t = await pg2.evaluate(() => document.body.innerText);
  check(/Appraisals|Goals/.test(t) && !/Start An Appraisal/.test(t) && !/Review And Sign Off/.test(t) && !t.includes('+ Add'), 'they can read Performance but not change it (no Start An Appraisal, no + Add): seeing is read-only');
  await pg2.screenshot({path: path.join(SHOTS, 'pm-sees-jake.png'), fullPage: true});
  await pg2.goto(B + '/pm/hr/access'); await pg2.waitForTimeout(3500);
  t = await pg2.evaluate(() => document.body.innerText);
  check(/Who Sees Everyone’s Folders/.test(t) && !/Save/.test(t) && !/Who Can See Whose Folder/.test(t) && !/Changes To HR Access/.test(t), 'HR Access for them: who sees everyone’s, read-only');
  await p2.ctx.close();

  // ---------- an operative's own record ----------
  S.grants = [{viewer_id: 'pmx9', user_id: 'me'}];
  const p3 = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(p3.db);
  DB = p3.db; ME = p3.db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {howto_dismissed: ['*']});
  if (!p3.db.profiles.some((p) => p.id === 'pmx9')) p3.db.profiles.push({id: 'pmx9', name: 'Paul Planner', role: 'pm', org_id: p3.db.organizations[0].id, email: 'pp@x.co'});
  emptyHr(p3.db); p3.db.hr_records = [{user_id: 'me', org_id: p3.db.organizations[0].id, job_title: 'Roofer'}];
  const pg3 = await p3.ctx.newPage(); pg3.on('pageerror', (e) => errs.push(e.message));
  await login(pg3);
  await pg3.goto(B + '/myrecord'); await pg3.waitForTimeout(4500);
  t = await pg3.evaluate(() => document.body.innerText);
  check(/Who Can See Your Folder: you/.test(t) && /Paul Planner sees only the parts HR allows/.test(t), 'an operative’s own record says who can see it');
  await pg3.screenshot({path: path.join(SHOTS, 'myrecord-who.png'), fullPage: true});
  await p3.ctx.close();

  // ---------- a Finance Controller ----------
  const p4 = await makeContext(browser, 'pm', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(p4.db);
  DB = p4.db; ME = p4.db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {role: 'pm', finance_only: true, finance_enabled: true, howto_dismissed: ['*']});
  emptyHr(p4.db);
  const pg4 = await p4.ctx.newPage(); pg4.on('pageerror', (e) => errs.push(e.message));
  await login(pg4);
  await pg4.goto(B + '/fin'); await pg4.waitForTimeout(4500);
  const hasHr = await pg4.evaluate(() => [...document.querySelectorAll('div')].some((d) => d.innerText === 'HR' && !d.children.length));
  check(/OpHUB Finance/.test(await pg4.evaluate(() => document.body.innerText)) && hasHr, 'a Finance Controller has HR in their menu');
  await p4.ctx.close();

  check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.log('STOPPED ' + e.message); process.exitCode = 1; });
