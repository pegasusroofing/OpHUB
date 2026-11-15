// HR Access, who can open HR and the HR folder in OneDrive (Andy, 15 Nov 2026: "I want to have hr linked to a specific
// folder in the OneDrive where access is managed, but also I need it to be clear in the app who could have access to it
// pm / admin / otherwise which is all set at the start by the admin and then there onwards").
// The company admin sets it up: All Company Admins / All Project Managers Yes / No and named people, with the names it
// comes to shown as they choose; Save; leaving themselves out asks first. Then the HR folder: a folder already used in
// OpHUB is refused with the reason; a new one is linked; who can open it is shown (through OpHUB; in OneDrive itself,
// with a warning for a link anyone can use; the company Microsoft sign-in); Copy Everything Now; the change log.
// A PM not chosen sees who can, read-only; an operative's own record says who can open it.
// The fake back end plays the database (the real rules are proven in SQL: docs/claude-code/sql/hr-folder-lock-15nov.sql)
// and the OneDrive functions (the lock itself: app-native/src/lib/rules/hrLock.test.ts). node hr15-check.js
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
const pick = async (page, boxLabel, choice) => { await page.getByLabel(boxLabel, {exact: true}).last().click(); await page.waitForTimeout(600); await page.getByText(choice, {exact: true}).last().click(); await page.waitForTimeout(500); };

// The database's HR functions, played here.
const S = {set_up: false, admins: null, pms: null, at: null, by: null, onedrive: null, named: [], log: [], lm: null};
let ME = null, DB = null;
const staffOf = () => DB.profiles.filter((p) => p.org_id === DB.organizations[0].id && !['client', 'superadmin'].includes(p.role) && !String(p.role).startsWith('subcontractor'));
const who = () => {
  const adm = S.set_up ? !!S.admins : true, pms = !!S.pms;
  const people = staffOf().map((p) => ({id: p.id, name: p.name, role: p.role, why: [S.named.includes(p.id) && 'named', adm && p.role === 'admin' && 'admin', pms && p.role === 'pm' && 'pm'].filter(Boolean)}))
    .filter((x) => x.why.length).sort((a, b) => a.name.localeCompare(b.name));
  return {set_up: S.set_up, team_admins: adm, team_pms: pms, named: S.named, people, set_up_at: S.at, set_up_by: S.by, log: people.some((p) => p.id === ME.id) || ME.role === 'admin' ? S.log : []};
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
      stamp(`All Company Admins: ${b.p_admins ? 'Yes' : 'No'}. All Project Managers: ${b.p_pms ? 'Yes' : 'No'}.`); return who();
    }
    if (name === 'hr_save_settings') {
      if (b.p_onedrive && b.p_onedrive.id === 'USED1') return {__status: 400, body: {code: 'P0001', message: 'linked_elsewhere'}};
      if (b.p_lm_sections) S.lm = b.p_lm_sections;
      if (b.p_clear_onedrive) { S.onedrive = null; stamp('HR folder in OneDrive removed.'); } else if (b.p_onedrive) { const fresh = !S.onedrive || S.onedrive.id !== b.p_onedrive.id; S.onedrive = b.p_onedrive; stamp(fresh ? `HR folder in OneDrive set to "${b.p_onedrive.name}".` : 'Copying changed.'); }
      return true;
    }
    if (name === 'hr_basic' || name === 'hr_my_reports') return name === 'hr_basic' ? null : [];
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

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---------- the company admin sets it up ----------
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  DB = db; ME = db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id;
  if (!db.profiles.some((p) => p.id === 'pmx9')) db.profiles.push({id: 'pmx9', name: 'Paul Planner', role: 'pm', org_id: O, email: 'pp@x.co'});
  db.hr_records = []; db.hr_docs = []; db.hr_history = []; db.hr_goals = []; db.hr_feedback = []; db.hr_appraisals = []; db.hr_bonuses = []; db.hr_team = [];
  setFakes();
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message)); const dupKeys = []; page.on('console', (m) => { if (/same key/.test(m.text())) dupKeys.push(m.text().slice(0, 160)); });
  const body = () => page.evaluate(() => document.body.innerText);
  await login(page);
  await page.goto(B + '/pm/hr/records'); await page.waitForTimeout(4000);
  check(/Not set up yet: every company admin can open everyone’s folders/.test(await body()), 'Employee Records: HR Access says it isn’t set up yet');
  await page.getByLabel('HR Access', {exact: true}).click(); await page.waitForTimeout(3500);
  let t = await body();
  check(/Not set up yet: every company admin can open HR/.test(t) && /Save Who Can Open HR/.test(t), 'HR Access: not set up, with Save Who Can Open HR');
  check(/All Company Admins/.test(t) && /All Project Managers/.test(t) && /Named People/.test(t) && /Everyone Else/.test(t), 'admins, project managers, named people, everyone else');
  check(t.includes(ME.name) && !/Paul Planner/.test(t), 'to start: the company admins (me), not the project managers');
  await page.screenshot({path: path.join(SHOTS, 'hr-access-start.png'), fullPage: true});
  // All Project Managers: Yes, and an operative named.
  await page.getByLabel('All Project Managers: Yes', {exact: true}).click(); await page.waitForTimeout(500);
  await pick(page, 'Add Someone', 'Jake Morris');
  t = await body();
  check(/Paul Planner/.test(t) && /Jake Morris/.test(t) && /These \d+ People Can Open HR/.test(t), 'the list shows who that comes to as it’s chosen (Paul Planner, PM; Jake Morris, named)');
  check(!S.set_up, 'nothing saved until Save');
  await page.getByText('Save Who Can Open HR', {exact: true}).click(); await page.waitForTimeout(2500);
  check(S.set_up && S.admins === true && S.pms === true && S.named.includes('o1'), `saved: admins Yes, PMs Yes, Jake named (${JSON.stringify({a: S.admins, p: S.pms, n: S.named})})`);
  t = await body();
  check(!/Save Who Can Open HR/.test(t) && /Set up by/.test(t) && !/Not set up yet/.test(t), 'then it says who set it up, and the Save button goes');
  // Leaving myself out asks first; No changes nothing.
  await page.getByLabel('All Company Admins: No', {exact: true}).click(); await page.waitForTimeout(500);
  await page.getByText('Save Changes', {exact: true}).click(); await page.waitForTimeout(1200);
  check(/You’re not in this list/.test(await body()), 'leaving myself out asks first');
  await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(S.admins === true, 'No: nothing saved');
  await page.getByText('Cancel', {exact: true}).click(); await page.waitForTimeout(600);
  check(!/Save Changes/.test(await body()), 'Cancel puts it back');

  // ---------- the HR folder ----------
  check(/Choose The HR Folder/.test(await body()), 'HR Folder In OneDrive: Choose The HR Folder');
  await page.getByText('Choose The HR Folder', {exact: true}).click(); await page.waitForTimeout(3500);
  t = await body();
  check(/Choose The HR Folder/.test(t) && /HR Private/.test(t) && !/Quick Link/.test(t), 'the picker opens, with no Quick Link pinning for the HR folder');
  await page.getByText('📁 Jobs', {exact: true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Use "Jobs"', {exact: true}).click(); await page.waitForTimeout(2000);
  check(/already used in OpHUB/.test(await body()), 'a folder already used in OpHUB is refused, with why');
  await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.getByText('‹ Up one level', {exact: true}).click(); await page.waitForTimeout(2000);
  await page.getByText('📁 HR Private', {exact: true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Use "HR Private"', {exact: true}).click(); await page.waitForTimeout(4000);
  check(S.onedrive && S.onedrive.id === 'NEW1' && S.onedrive.on === true, 'a new folder is linked');
  t = await body();
  check(/📁 HR Private/.test(t) && /Copy HR Documents Here/.test(t), 'back on HR Access: the folder, copying on');
  check(/Through OpHUB/.test(t) && /Only the \d+ people above/.test(t), 'who can open it through OpHUB: the people above');
  check(/In OneDrive Itself/.test(t) && /Andy Cramp/.test(t) && /Owner/.test(t) && /⚠ Anyone With The Link/.test(t), 'in OneDrive itself: who it’s shared with, a link anyone can use flagged');
  check(/office@rtb\.test/.test(t) && /company Microsoft sign-in/.test(t), 'and the company Microsoft sign-in OpHUB uses');
  check(/A link or group can open this folder outside OpHUB/.test(t) && /Manage Access In OneDrive ↗/.test(t), 'with a warning, and Manage Access In OneDrive');
  await page.getByText('Copy All Now', {exact: true}).click(); await page.waitForTimeout(2000);
  check(/3 documents copied/.test(await body()) && fnCalls.some((c) => c.name === 'hr-onedrive-copy' && c.b.all), 'Copy All Now copies, and says how many');
  t = await body();
  check(/Changes To HR Access/.test(t) && /HR folder in OneDrive set to "HR Private"/.test(t) && /All Project Managers: Yes/.test(t), 'the changes are listed');
  await page.screenshot({path: path.join(SHOTS, 'hr-access-laptop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844}); await page.waitForTimeout(1500);
  await page.screenshot({path: path.join(SHOTS, 'hr-access-phone.png'), fullPage: true});
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check(!wide, 'phone: nothing runs off the side');
  const rowsOf = await page.evaluate(() => { const ys = ['Change Folder', 'Copy All Now'].map((t) => { const el = [...document.querySelectorAll('div')].find((d) => d.innerText === t && !d.children.length); return el ? Math.round(el.getBoundingClientRect().top) : null; }); return ys; });
  check(rowsOf.every((y) => y !== null) && new Set(rowsOf).size === 1, 'phone: the folder buttons sit on one row (' + rowsOf.join(', ') + ')');
  check(!dupKeys.length, 'no repeated list keys' + (dupKeys.length ? ': ' + dupKeys[0] : ''));
  // Picking a folder for something else: the HR folder can't be used or pinned.
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/pm/onedrive-pick?target=progress&id=s1'); await page.waitForTimeout(3500);
  await page.getByText('📁 HR Private', {exact: true}).click(); await page.waitForTimeout(2500);
  t = await body();
  check(/This is the HR folder/.test(t) && !/Use "HR Private"/.test(t) && !/Pin as a Quick Link/.test(t), 'picking a folder for a project: the HR folder can’t be used or pinned');
  await ctx.close();

  // ---------- a project manager not chosen: read-only ----------
  Object.assign(S, {admins: true, pms: false});
  const p2 = await makeContext(browser, 'pm', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(p2.db);
  DB = p2.db; ME = p2.db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {role: 'pm', howto_dismissed: ['*']});
  p2.db.hr_records = []; p2.db.hr_docs = []; p2.db.hr_history = []; p2.db.hr_goals = []; p2.db.hr_feedback = []; p2.db.hr_appraisals = []; p2.db.hr_bonuses = [];
  const pg2 = await p2.ctx.newPage(); pg2.on('pageerror', (e) => errs.push(e.message));
  await login(pg2);
  await pg2.goto(B + '/pm/hr/access'); await pg2.waitForTimeout(4000);
  t = await pg2.evaluate(() => document.body.innerText);
  check(/Who Can Open HR/.test(t) && /Jake Morris/.test(t) && /Everyone Else/.test(t) && !/Save/.test(t) && !/HR Folder In OneDrive/.test(t) && !/Changes To HR Access/.test(t), 'a PM not chosen sees who can open HR, read-only: no Save, no folder, no change log');
  await pg2.screenshot({path: path.join(SHOTS, 'hr-access-readonly.png'), fullPage: true});
  await p2.ctx.close();

  // ---------- an operative's own record ----------
  const p3 = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(p3.db);
  DB = p3.db; ME = p3.db.profiles.find((p) => p.id === 'me'); Object.assign(ME, {howto_dismissed: ['*']});
  p3.db.hr_records = [{user_id: 'me', org_id: p3.db.organizations[0].id, job_title: 'Roofer'}]; p3.db.hr_docs = []; p3.db.hr_history = []; p3.db.hr_goals = []; p3.db.hr_feedback = []; p3.db.hr_appraisals = []; p3.db.hr_bonuses = [];
  const pg3 = await p3.ctx.newPage(); pg3.on('pageerror', (e) => errs.push(e.message));
  await login(pg3);
  await pg3.goto(B + '/myrecord'); await pg3.waitForTimeout(4500);
  t = await pg3.evaluate(() => document.body.innerText);
  check(/Who Can Open Your Folder: you, and HR: .*Jake Morris/.test(t), 'an operative’s own record says who can open it');
  await pg3.screenshot({path: path.join(SHOTS, 'myrecord-who.png'), fullPage: true});
  await p3.ctx.close();

  check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.log('STOPPED ' + e.message); process.exitCode = 1; });
