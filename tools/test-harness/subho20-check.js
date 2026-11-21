// Subcontractors' Handover (Andy, 20 Nov 2026): "allow the handover to be a tile for the subcontractors but dont allow it to
// be submitted until the subbie SOW is fully complete"; "an email to pm and notification in hub"; and what their operatives
// see ("show me what they see": Check In used to send them back to their company page). On a phone, then the PM on a laptop.
// Fake database (the database's own submit rule and the PM's message are proved separately in SQL). node subho20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'subho20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  const O = me.org_id;
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: '2026-11-01T09:00:00Z'}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: true}];
  db.schedule_sections = [{id: 'ss1', site_id: S1, name: 'Decorations', position: 0}];
  db.schedule_tasks = [{id: 'st1', site_id: S1, section_id: 'ss1', name: 'Paint fascias', status: 'progress', position: 0, subcontractor_company_id: 'co1'}];
  db.handover_om_manuals = []; db.coshh_docs = []; db.cpp_plans = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  const tab = async (n) => { await page.getByRole('tab', {name: new RegExp(`^${n}`)}).first().click(); await page.waitForTimeout(900); };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Their admin, Schedule of Works not finished ----
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
  let t = await text();
  // Four tabs since 21 Nov 2026; their own people keep Check In, My Induction and Calendar at the top (Site Rules are signed in the induction).
  check(/Handover/.test(t) && /Check In \/ Out/.test(t) && /My Induction/.test(t) && /Calendar/.test(t) && !/Site Rules & Layout/.test(t), 'their company page: a Handover tab, plus Check In, My Induction and Calendar');
  await page.screenshot({path: path.join(SHOTS, 'company-page.png'), fullPage: true});
  await vis('Handover').first().click(); await page.waitForTimeout(1200);
  await vis('O&M Manual').first().click(); await page.waitForTimeout(4000);
  t = await text();
  check(/Schedule Of Works: 0 of 1 Tasks Complete/.test(t) && /submitted once every task/.test(t), 'Handover: says their Schedule of Works isn’t complete (0 of 1)');
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), vis('⬆️ Upload Our O&M (PDF)').first().click()]);
  await fc.setFiles({name: 'Pro Finish O&M.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF')}); await page.waitForTimeout(4000);
  const up = db.handover_om_manuals[0];
  t = await text();
  check(!!up && !up.submitted_at && /kept as a draft/.test(t), 'an upload before the Schedule of Works is done is kept as a draft, and it says so');
  check(/Not Submitted Yet/.test(t) && await page.getByRole('button', {name: 'Submit', exact: true}).first().isDisabled().catch(() => false), 'its Submit button waits');
  await page.screenshot({path: path.join(SHOTS, 'handover-waiting.png'), fullPage: true});
  await vis('+ Build One Here').first().click(); await page.waitForTimeout(7000);
  await tab('Issue');
  t = await text();
  check(/Your Schedule Of Works Complete \(0 of 1\)/.test(t) && await page.getByRole('button', {name: 'Submit Revision 1'}).first().isDisabled().catch(() => false), 'builder: "Your Schedule Of Works Complete (0 of 1)" required; Submit Revision 1 waits');
  // ---- The task is finished: Submit ----
  db.schedule_tasks[0].status = 'done';
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/om`); await page.waitForTimeout(4000);
  t = await text();
  check(/✓ Schedule Of Works Complete \(1 of 1\)/.test(t), 'once the task is done: "✓ Schedule Of Works Complete"');
  await page.getByRole('button', {name: 'Submit', exact: true}).first().click(); await page.waitForTimeout(800);
  await vis('Yes').last().click(); await page.waitForTimeout(3000);
  check(!!db.handover_om_manuals.find((x) => x.id === up.id).submitted_at, 'the uploaded O&M is submitted');

  // ---- An ordinary operative of theirs: Check In, Calendar and their SOW open ----
  db.subcontractor_operatives[0].is_admin = false;
  await page.goto(`${B}/sites/${S1}/checkin`); await page.waitForTimeout(5000);
  check(/\/checkin/.test(page.url()), `their operative reaches Check In (${new URL(page.url()).pathname.replace(S1, 'JOB')})`);
  await page.screenshot({path: path.join(SHOTS, 'operative-checkin.png'), fullPage: true});
  await page.goto(`${B}/sites/${S1}/calendar`); await page.waitForTimeout(4000);
  check(/\/calendar/.test(page.url()), 'and the Calendar');
  await page.goto(`${B}/sites/${S1}/schedule`); await page.waitForTimeout(4000);
  check(/\/mc\/subcontractors\/co1\/schedule/.test(page.url()), 'SOW opens their company’s Schedule of Works');
  await page.goto(`${B}/sites/${S1}/hs`); await page.waitForTimeout(4000);
  check(/\/mc\/subcontractors\/co1$/.test(new URL(page.url()).pathname), 'other job pages still go to their company page');
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(4000);
  check(!/Handover/.test(await text()), 'an ordinary operative has no Handover tile');

  // ---- The PM: the HUB note and Handover on a live main contractor job ----
  me.role = 'admin'; db.subcontractor_operatives = [];
  db.messages = (db.messages || []).concat([{id: 'msom', org_id: O, site_id: S1, sender_id: 'o1', audience: 'managers', kind: 'message', related_id: up.id, body: 'Pro Finish Decorators Ltd submitted their O&M manual "Pro Finish O&M". It goes in the back of your O&M manual: Handover › O&M Manuals.', created_at: new Date().toISOString(), parent_id: null}]);
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(`${B}/inbox?tab=todo`); await page.waitForTimeout(7000);
  t = await text();
  check(/Subcontractor O&M/.test(t) && /Pro Finish Decorators Ltd submitted their O&M manual "Pro Finish O&M"/.test(t), 'PM’s HUB: "Subcontractor O&M — Pro Finish Decorators Ltd submitted their O&M manual…"');
  await page.screenshot({path: path.join(SHOTS, 'pm-hub.png')});
  await page.getByText(/submitted their O&M manual/).first().click(); await page.waitForTimeout(4000);
  check(/\/handover/.test(page.url()), 'tapping it opens Handover');
  await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(5000);
  check(/Handover/.test(await text()), 'the job home has Handover on a live main contractor job');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
