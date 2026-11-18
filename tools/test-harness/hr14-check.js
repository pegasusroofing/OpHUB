// HR › Employee Records (Andy, 14 Nov 2026): the company admin sees everyone's folder and fills it in (employment, line
// manager, documents with what's missing, appraisals, goals, feedback, bonus, job history, how often appraisals come
// round); an operative opens their own from My Account, keeps their details up to date, adds their own ID, fills in
// their side of an appraisal, and can't add bonuses or give themselves feedback. HR Access (15 Nov 2026): start the HR
// team, what line managers see, appraisals; a line manager (not on the HR team) sees only what's allowed. The fake
// database has no security rules; those are proven in SQL (docs/claude-code/sql/hr-access-15nov.sql). node hr14-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const SAMPLE = path.join(__dirname, 'shots', 'samples', 'sample.pdf');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const pick = async (page, boxLabel, choice) => { await page.getByLabel(boxLabel, {exact: true}).last().click(); await page.waitForTimeout(600); await page.getByText(choice, {exact: true}).last().click(); await page.waitForTimeout(500); };
// The HR functions, played by the fake back end (who's on the HR team, the settings, the basics for a line manager).
let TEAM = true;
const setRpc = (db) => { global.__rpc = (name, b) => {
  const st = (db.hr_settings || []).find((x) => x.org_id === db.organizations[0].id) || {};
  if (name === 'hr_my_access') return {team: TEAM, team_set: (db.hr_team || []).length > 0, lm_sections: st.hr_lm_sections || ['performance', 'emergency'], appraisal_months: st.appraisal_months || 12, onedrive: TEAM ? st.hr_onedrive || null : null};
  if (name === 'hr_save_settings') { db.hr_settings = db.hr_settings || []; let row = db.hr_settings.find((x) => x.org_id === db.organizations[0].id); if (!row) { row = {org_id: db.organizations[0].id}; db.hr_settings.push(row); } if (b.p_months != null) row.appraisal_months = b.p_months; if (b.p_lm_sections) row.hr_lm_sections = b.p_lm_sections; if (b.p_onedrive) row.hr_onedrive = b.p_onedrive; if (b.p_clear_onedrive) row.hr_onedrive = null; return true; }
  if (name === 'hr_who_has_access') { const team = db.hr_team || []; const set = team.length > 0; return {set_up: set, team_admins: !set, team_pms: false, named: team.map((x) => x.user_id), people: db.profiles.filter((p) => team.some((x) => x.user_id === p.id) || (!set && p.role === 'admin')).map((p) => ({id: p.id, name: p.name, role: p.role, why: team.some((x) => x.user_id === p.id) ? ['named'] : ['admin']})), set_up_at: null, set_up_by: null, log: []}; }
  if (name === 'hr_save_team') { db.hr_team = (b.p_people || []).map((u) => ({org_id: db.organizations[0].id, user_id: u})); return {set_up: true, team_admins: !!b.p_admins, team_pms: !!b.p_pms, named: b.p_people || [], people: [], log: []}; }
  if (name === 'hr_sections_for') return (db.hr_records || []).some((x) => x.user_id === b.p_user && x.line_manager_id === 'me') ? (st.hr_lm_sections || ['performance', 'emergency']) : [];
  if (name === 'hr_basic') { const r = (db.hr_records || []).find((x) => x.user_id === b.p_user); return r ? {user_id: r.user_id, job_title: r.job_title, line_manager_id: r.line_manager_id, emergency_name: r.emergency_name} : null; }
  if (name === 'hr_my_reports') return (db.hr_records || []).filter((x) => x.line_manager_id === 'me').map((x) => ({user_id: x.user_id, job_title: x.job_title}));
  return undefined;
}; };
const fillBox = async (page, label, text) => { const l = page.getByText(label, {exact: true}).last(); const box = l.locator('xpath=following::*[self::input or self::textarea][1]'); await box.fill(text); };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---------- the company admin ----------
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id;
  db.hr_records = []; db.hr_docs = []; db.hr_history = []; db.hr_goals = []; db.hr_feedback = []; db.hr_appraisals = []; db.hr_bonuses = [];
  db.hr_settings = db.hr_settings || []; db.hr_team = [];
  setRpc(db);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await login(page);
  const body = () => page.locator('body').innerText();
  await page.goto(B + '/pm/hr'); await page.waitForTimeout(4000);
  check(/Employee Records/.test(await body()), 'HR lists Employee Records');
  await page.getByText('Employee Records', {exact: true}).click(); await page.waitForTimeout(4000);
  let t = await body();
  check(/Jake Morris/.test(t) && /Tom Hughes/.test(t) && /Dave Driver/.test(t), 'the admin sees everyone\'s folder');
  check(/To Sort/.test(t), 'with what each needs sorting');
  check(/Every company admin sees everyone’s folders/.test(t), 'HR Access says every company admin sees everyone’s folders to start');
  await page.screenshot({path: path.join(SHOTS, 'hr-records-list.png')});
  // HR Access.
  await page.getByLabel('HR Access', {exact: true}).click(); await page.waitForTimeout(3000);
  // Compact HR Access (15 Nov 2026; its own check: hr15-check.js): grouped by role, a line each opening a pop-up.
  t = await body();
  check(/Who Can See What/.test(t) && /\nAdmin\n/.test(t) && /Sees Everyone/.test(t), 'HR Access: grouped under the company’s roles (16 Nov); the company admins see everyone’s');
  await page.getByLabel('What Line Managers See', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Personal details \(address, date of birth\) stay with HR/.test(t) && /Disciplinary & Grievance/.test(t), 'What Line Managers See: the sensitive parts are choices too (16 Nov); personal details stay with HR');
  await page.getByLabel('Job History: Yes', {exact: true}).last().click();
  await page.waitForTimeout(1500);
  const lm = (db.hr_settings.find((x) => x.org_id === O) || {}).hr_lm_sections || [];
  check(lm.includes('history') && lm.includes('performance'), `line managers may now see job history too (${lm.join(', ')})`);
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);
  await pick(page, 'Appraisals Come Round', 'Every 6 Months');
  check((db.hr_settings.find((x) => x.org_id === O) || {}).appraisal_months === 6, 'appraisals every 6 months saved');
  await page.screenshot({path: path.join(SHOTS, 'hr-access.png'), fullPage: true});
  await page.getByLabel('HR Folder In OneDrive', {exact: true}).click(); await page.waitForTimeout(1500);
  check(/Choose The HR Folder/.test(await body()), 'the HR folder in OneDrive can be chosen');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.goto(B + '/pm/hr/records'); await page.waitForTimeout(3500);

  // Jake's folder: employment.
  await page.getByLabel('Jake Morris', {exact: true}).click(); await page.waitForTimeout(4000);
  check(/\/pm\/hr\/records\/o1/.test(page.url()), 'opens Jake\'s folder');
  await page.getByLabel('Edit: Employment').click(); await page.waitForTimeout(800);
  await fillBox(page, 'Job Title', 'Roofer');
  await pick(page, 'Employment Type', 'Employee');
  await pick(page, 'Line Manager', me.name);
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  let r = db.hr_records.find((x) => x.user_id === 'o1');
  check(!!r && r.job_title === 'Roofer' && r.employment_type === 'employee' && r.line_manager_id === 'me', `employment saved (${r && [r.job_title, r.employment_type, r.line_manager_id].join(', ')})`);
  check(/Roofer · Employee/.test(await body()), 'the header shows Roofer · Employee');
  await page.getByLabel('Edit: Personal Details').click(); await page.waitForTimeout(800);
  await fillBox(page, 'Postcode', 'SW4 6RZ'); await fillBox(page, 'Personal Phone', '07700 900123');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  r = db.hr_records.find((x) => x.user_id === 'o1');
  check(r.postcode === 'SW4 6RZ' && r.personal_phone === '07700 900123' && r.job_title === 'Roofer', 'personal details saved, employment kept');
  await page.screenshot({path: path.join(SHOTS, 'hr-details.png')});

  // Documents: the checklist, and adding the contract.
  await page.getByRole('tab', {name: 'Documents'}).click(); await page.waitForTimeout(1000);
  t = await body();
  check(/Written Statement Of Employment \(Contract\)/.test(t) && /Right To Work Check/.test(t) && /HAVS Health Check/.test(t) && /Not On File/.test(t), 'Documents: what should be on file for a site employee, flagged Not On File');
  check(/Payslips & Tax/.test(t) && /Contracts & Letters/.test(t) && /Training Certificates & Cards/.test(t), 'Documents: the folders, and his training certificates');
  await page.getByLabel('Written Statement Of Employment (Contract)', {exact: true}).click(); await page.waitForTimeout(1000);
  check(/Add A Document/.test(await body()), 'tapping a missing item opens Add A Document for it');
  const fc = page.waitForEvent('filechooser'); await page.getByText('Choose File…', {exact: true}).click(); await (await fc).setFiles([SAMPLE]); await page.waitForTimeout(800);
  await page.getByText('Upload', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const d = db.hr_docs.find((x) => x.user_id === 'o1' && x.item_key === 'contract');
  check(!!d && d.folder === 'contracts' && /^.+\/o1\/.+sample\.pdf$/.test(d.storage_path) && d.hidden_from_employee === false, `the contract is in his Contracts folder (${d && d.storage_path})`);
  check(/On File/.test(await body()), 'and shows On File');
  await page.screenshot({path: path.join(SHOTS, 'hr-documents.png'), fullPage: true});

  // Performance: appraisal, goal, feedback.
  await page.getByRole('tab', {name: 'Performance'}).click(); await page.waitForTimeout(800);
  await page.getByText('Start An Appraisal', {exact: true}).click(); await page.waitForTimeout(2000);
  check(db.hr_appraisals.some((a) => a.user_id === 'o1' && a.status === 'due'), 'Start An Appraisal opens one for him');
  check(/Waiting For Their Side/.test(await body()), 'waiting for his side');
  await page.getByLabel('+ Add: Goals').click(); await page.waitForTimeout(800);
  await page.getByText('Get An IPAF Or PASMA Ticket', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.hr_goals.some((g) => g.user_id === 'o1' && g.title === 'Get An IPAF Or PASMA Ticket' && g.set_by === 'me'), 'a goal from the ideas');
  await page.getByLabel('+ Give Feedback: Feedback').click(); await page.waitForTimeout(800);
  await page.locator('textarea >> visible=true').first().fill('Kept the Studley Rd site spotless all week.');
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.hr_feedback.some((f) => f.user_id === 'o1' && f.kind === 'praise' && f.from_id === 'me' && !f.private), 'praise given');
  await page.screenshot({path: path.join(SHOTS, 'hr-performance.png'), fullPage: true});

  // Bonus and history.
  await page.getByRole('tab', {name: 'Bonus'}).click(); await page.waitForTimeout(800);
  check(/safety bonus/.test(await body()), 'Bonus suggests ideas that suit a roofing firm');
  await page.getByLabel('+ Add: Bonus').click(); await page.waitForTimeout(800);
  await fillBox(page, 'Period', 'October To December 2026'); await fillBox(page, 'Amount (£)', '250');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.hr_bonuses.some((b) => b.user_id === 'o1' && b.amount === 250 && b.basis === 'safety'), 'a £250 safety bonus added');
  await page.getByRole('tab', {name: 'History'}).click(); await page.waitForTimeout(800);
  await page.getByLabel('+ Add: Job History').click(); await page.waitForTimeout(800);
  await fillBox(page, 'What Happened', 'Promoted to Chargehand');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.hr_history.some((h) => h.user_id === 'o1' && h.title === 'Promoted to Chargehand'), 'job history entry added');
  check(!errs.length, `admin: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();

  // ---------- a line manager, not on the HR team ----------
  const m = await makeContext(browser, 'pm', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(m.db);
  Object.assign(m.db.profiles.find((p) => p.id === 'me'), {role: 'pm', howto_dismissed: ['*']});
  m.db.hr_records = [{user_id: 'o1', org_id: m.db.organizations[0].id, job_title: 'Roofer', line_manager_id: 'me', emergency_name: 'Sue Morris', postcode: 'SW4 6RZ'}];
  m.db.hr_docs = [{id: 'hd1', org_id: m.db.organizations[0].id, user_id: 'o1', folder: 'contracts', item_key: 'contract', title: 'Contract', storage_path: 'x/o1/c.pdf', hidden_from_employee: false, created_at: new Date().toISOString()}];
  m.db.hr_history = []; m.db.hr_goals = []; m.db.hr_feedback = []; m.db.hr_appraisals = []; m.db.hr_bonuses = []; m.db.hr_team = [{org_id: m.db.organizations[0].id, user_id: 'someone'}];
  TEAM = false; setRpc(m.db);
  const mp = await m.ctx.newPage(); const merrs = []; mp.on('pageerror', (e) => merrs.push(e.message));
  await login(mp);
  await mp.goto(B + '/pm/hr/records'); await mp.waitForTimeout(4000);
  let mt = await mp.locator('body').innerText();
  check(/Jake Morris/.test(mt) && /You Can See/.test(mt) && !/Tom Hughes/.test(mt) && !/HR Access/.test(mt), 'a line manager sees only themselves and the people they line-manage, and no HR Access');
  await mp.getByLabel('Jake Morris', {exact: true}).click(); await mp.waitForTimeout(4000);
  mt = await mp.locator('body').innerText();
  const tabNames = await mp.getByRole('tab').allInnerTexts();
  check(!tabNames.includes('Documents') && !tabNames.includes('Bonus') && tabNames.includes('Performance'), `their tabs: ${tabNames.join(', ')} (no Documents, no Bonus)`);
  check(!/Personal Details/.test(mt) && !/SW4 6RZ/.test(mt) && /Emergency Contact/.test(mt) && /Sue Morris/.test(mt), 'no personal details, but the emergency contact');
  check(!/Contract/.test(mt.replace(/Contracts, pay and the rest are for the HR team/, '')), 'no contract anywhere');
  await mp.screenshot({path: path.join(SHOTS, 'hr-linemanager.png')});
  check(!merrs.length, `line manager: no page errors ${merrs.slice(0, 2).join(' | ')}`);
  await m.ctx.close();

  // ---------- an operative, their own ----------
  const o = await makeContext(browser, 'operative', [], {shot: true});
  require('./seeds/world')(o.db);
  const om = o.db.profiles.find((p) => p.id === 'me'); Object.assign(om, {role: 'operative', howto_dismissed: ['*']});
  o.db.hr_records = [{user_id: 'me', org_id: o.db.organizations[0].id, job_title: 'Roofer', employment_type: 'employee', line_manager_id: 'pmx'}];
  o.db.hr_docs = []; o.db.hr_history = []; o.db.hr_goals = []; o.db.hr_feedback = []; o.db.hr_bonuses = [];
  o.db.hr_appraisals = [{id: 'ap1', org_id: o.db.organizations[0].id, user_id: 'me', manager_id: 'pmx', due_date: '2026-12-01', status: 'due', self_answers: null, review: null, created_at: new Date().toISOString()}];
  setRpc(o.db);
  const op = await o.ctx.newPage(); const oerrs = []; op.on('pageerror', (e) => oerrs.push(e.message));
  await login(op);
  const ob = () => op.locator('body').innerText();
  await op.goto(B + '/account'); await op.waitForTimeout(4000);
  // A plain row since 18 Nov 2026.
  await op.getByText('My Employee Record', {exact: true}).click(); await op.waitForTimeout(4000);
  const seen = await ob();
  check(/\/myrecord/.test(op.url()) && /Your Personal Details/.test(seen), `an operative opens My Employee Record from My Account (${op.url().split('8081')[1]}: ${seen.slice(0, 160).replace(/\n/g, ' | ')})`);
  await op.getByLabel('Edit: Your Personal Details').click(); await op.waitForTimeout(800);
  await fillBox(op, 'Personal Phone', '07700 900456');
  await fillBox(op, 'Name', 'Sue Morris');
  await op.getByText('Save', {exact: true}).last().click(); await op.waitForTimeout(2000);
  const or = o.db.hr_records.find((x) => x.user_id === 'me');
  check(or.personal_phone === '07700 900456' && or.emergency_name === 'Sue Morris', 'they update their own details and emergency contact');
  await op.getByRole('tab', {name: 'Documents'}).click(); await op.waitForTimeout(800);
  await op.getByText('+ Add A Document', {exact: true}).click(); await op.waitForTimeout(800);
  await op.getByLabel('Folder', {exact: true}).last().click(); await op.waitForTimeout(600);
  const folders = await ob();
  check(/Right To Work & ID/.test(folders) && !/Disciplinary & Grievance/.test(folders.split('Folder').pop()), 'they can add to their own ID / licences / health folders only');
  await op.keyboard.press('Escape'); await op.waitForTimeout(400);
  const xs = op.locator('[aria-label="Close"] >> visible=true'); if (await xs.count()) await xs.last().click(); await op.waitForTimeout(500);
  await op.getByRole('tab', {name: 'Performance'}).click(); await op.waitForTimeout(800);
  check(!/\+ Give Feedback/.test(await ob()), 'no feedback to themselves');
  await op.getByText('Fill In Your Side', {exact: true}).click(); await op.waitForTimeout(800);
  await op.locator('textarea >> visible=true').first().fill('Got the Studley Rd roof finished early.');
  await op.getByText('Send To My Manager', {exact: true}).click(); await op.waitForTimeout(2000);
  const ap = o.db.hr_appraisals.find((a) => a.id === 'ap1');
  check(ap.status === 'self_done' && /finished early/.test(Object.values(ap.self_answers || {}).join(' ')), 'they fill in their side of the appraisal and send it on');
  await op.getByRole('tab', {name: 'Bonus'}).click(); await op.waitForTimeout(800);
  check(!/\+ Add/.test(await ob()), 'they can\'t add a bonus');
  await op.screenshot({path: path.join(SHOTS, 'hr-myrecord-phone.png')});
  check(!oerrs.length, `operative: no page errors ${oerrs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
