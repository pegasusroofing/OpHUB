// Main Contractor mode (Andy, 21 Nov 2026: "change the main contractor to be a main contractor mode which completely
// changes the layouts when chosen"; Ideas 1 + 3 mixed, "Yes, build it"). A manager's home on a main contractor job: the
// counts, Set Up, Today / Run The Site / Documents / Handover, Fire Roll Call, Our Own Works folded; the phone bar Today,
// People, Check In, Permits, HUB. An operative's page is as before. Fake database. node mcmode21-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'mcmode21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const seedJob = (db) => {
  require('./seeds/world')(db);
  const O = db.profiles.find((p) => p.id === 'me').org_id;
  db.profiles.push({id: 's1', name: 'Sam Slater', role: 'operative', org_id: O, email: 's1@x.co'});
  db.subcontractor_companies = [{id: 'sc1', org_id: O, site_id: S1, name: 'Slate & Tile Co', created_at: iso}, {id: 'sc2', org_id: O, site_id: S1, name: 'Northside Scaffolding', created_at: iso}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'sc1', user_id: 's1', is_admin: false}];
  db.site_assignments = (db.site_assignments || []).filter((a) => a.site_id !== S1).concat([{id: 'a1', site_id: S1, user_id: 'o1'}, {id: 'a2', site_id: S1, user_id: 'o2'}]);
  const now = new Date().toISOString();
  db.checkins = [{id: 'c1', site_id: S1, user_id: 'o1', type: 'in', ts: now}, {id: 'c2', site_id: S1, user_id: 's1', type: 'in', ts: now}, {id: 'c3', site_id: S1, user_id: 'o2', type: 'out', ts: now}];
  db.site_induction_completions = [{id: 'ic1', site_id: S1, operative_id: 'o1', completed_at: now}];
  db.permits = [{id: 'p1', org_id: O, site_id: S1, permit_type: 'Hot Works', location: 'Roof Area B', work_date: iso, status: 'open', assigned_user_ids: [], created_at: now}];
  db.rams_docs = [...(db.rams_docs || []), {id: 'r9', site_id: S1, name: 'Scaffold RAMS', status: 'current', approval_status: 'pending', subcontractor_company_id: 'sc2', uploaded_at: now}];
  db.delivery_tasks = [{id: 'd1', org_id: O, site_id: S1, description: 'Slate Delivery', time_slot: 'AM', scheduled_date: iso, status: 'pending'}];
  // A visitor signed in from the QR code (21 Nov 2026).
  db.site_visitors = [{id: 'v1', site_id: S1, org_id: O, name: 'Vera Visitor', phone: '07700 900444', company: 'Building Control', signed_in_at: now, signed_out_at: null}];
  Object.assign(db.sites.find((x) => x.id === S1), {visitor_key: 'k-good'});
  return O;
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const login = async (page) => {
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  };
  for (const [w, h, tag] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    seedJob(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(900); };
    await login(page);
    await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(7000);
    let t = await text();
    check(/MAIN CONTRACTOR/.test(t) && await page.getByLabel(/^3 On Site Now/).count() > 0 && await page.getByLabel('2 Inductions To Do').count() > 0 && await page.getByLabel(/^1 Permits Open/).count() > 0 && await page.getByLabel('1 RAMS To Approve').count() > 0,
      `${tag}: the counts: 3 on site (with the visitor), 2 inductions to do, 1 permit open, 1 RAMS to approve`);
    check(/Today/.test(t) && /(Run The Site|Site)/.test(t) && /(Documents|Docs)/.test(t) && /Handover/.test(t), `${tag}: tabs Today / Run The Site / Documents / Handover`);
    check(/Daily Briefing/.test(t) && /Not done yet today/.test(t) && /Induct 2 People/.test(t) && /Close Hot Works Permit/.test(t) && /Approve Scaffold RAMS/.test(t), `${tag}: Today's checklist: briefing, induct 2, close the permit, approve the RAMS`);
    check(/Slate Delivery/.test(t) && /Our Team/.test(t) && /Slate & Tile Co/.test(t), `${tag}: arriving today, and who's on site by company`);
    await page.screenshot({path: path.join(SHOTS, `today-${tag}.png`), fullPage: true});
    if (tag === 'laptop') {
      await page.getByText('Fire Roll Call', {exact: true}).first().click(); await page.waitForTimeout(800);
      t = await text();
      check(/Fire Roll Call · 3 On Site/.test(t) && /0 Of 3 Accounted For/.test(t) && /Sam Slater/.test(t) && /Vera Visitor/.test(t), 'Fire Roll Call lists who is checked in, visitors too');
      await page.getByRole('checkbox', {name: 'Sam Slater'}).click(); await page.waitForTimeout(300);
      check(/1 Of 3 Accounted For/.test(await text()), 'ticking someone counts them as accounted for');
      await page.screenshot({path: path.join(SHOTS, 'rollcall-laptop.png')});
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      if (/Accounted For/.test(await text())) { await page.getByLabel('Close').first().click().catch(() => {}); await page.waitForTimeout(400); }
      // Visitors Today, the QR code, and signing out someone who forgot.
      t = await text();
      check(/VISITORS TODAY · 1/.test(t) && /Vera Visitor · Building Control/.test(t), 'Visitors Today lists the visitor and their company');
      await page.getByText('Visitor Sign-In (QR)', {exact: true}).click(); await page.waitForTimeout(800);
      check(await page.getByLabel('QR code').count() > 0 && /\/visit\/k-good/.test(await text()), 'Visitor Sign-In shows the job\'s QR code and link');
      await page.screenshot({path: path.join(SHOTS, 'visitor-qr-laptop.png')});
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      if (await page.getByLabel('QR code').count()) { await page.getByLabel('Close').first().click().catch(() => {}); await page.waitForTimeout(400); }
      await page.getByText('Sign Them Out', {exact: true}).first().click(); await page.waitForTimeout(1500);
      check(!!db.site_visitors[0].signed_out_at && db.site_visitors[0].signed_out_by === 'me', 'a manager can sign a visitor out');
      await tab(/^Run The Site$/);
      t = await text();
      check(/DAILY RUNNING/.test(t) && /Permits To Work/.test(t) && /Everyone On This Job/.test(t) && /Northside Scaffolding/.test(t) && /RAMS to approve/.test(t) && /\+ Add Subcontractor/.test(t), 'Run The Site: the daily running and the subcontractors (with RAMS to approve)');
      await page.screenshot({path: path.join(SHOTS, 'runthesite-laptop.png'), fullPage: true});
      await tab(/^Documents$/);
      t = await text();
      check(/Construction Phase Plan/.test(t) && /Site Rules & Layout/.test(t) && /F10 Notification/.test(t) && /Asbestos Register/.test(t), 'Documents: the plan, site rules, F10 and asbestos');
      await tab(/^Handover$/);
      t = await text();
      check(/O&M manual/.test(t) && /Slate & Tile Co · Close-Out/.test(t), 'Handover: the O&M manual and each subcontractor\'s close-out');
      await page.getByText('Our Own Works', {exact: true}).click(); await page.waitForTimeout(800);
      t = await text();
      check(/Schedule of Works/.test(t) && /Materials/.test(t), 'Our Own Works opens our own trade\'s rows');
      // Who sees it (Andy, 21 Nov 2026): Project Settings › Site Type › Who Sees Main Contractor Mode.
      check(/Who Sees Main Contractor Mode ›/.test(t), 'a link to who sees it, for an admin');
      await page.goto(`${B}/sites/${S1}/admin`); await page.waitForTimeout(5000);
      await page.getByText(/^⚙ Site Set Up/).first().click(); await page.waitForTimeout(700);
      await page.getByText(/^Site Type/).first().click(); await page.waitForTimeout(700);
      check(/Who Sees Main Contractor Mode\?/.test(await text()), 'Project Settings › Site Type asks Who Sees Main Contractor Mode?');
      await page.getByLabel('Who Sees Main Contractor Mode', {exact: true}).click(); await page.waitForTimeout(600);
      await page.getByText('Only The People Ticked', {exact: true}).last().click(); await page.waitForTimeout(1500);
      const site = db.sites.find((x) => x.id === S1);
      check(Array.isArray(site.mc_mode_users) && site.mc_mode_users.includes('me'), `Only The People Ticked starts with you ticked (${JSON.stringify(site.mc_mode_users)})`);
      await page.screenshot({path: path.join(SHOTS, 'who-sees-laptop.png'), fullPage: true});
      await page.getByRole('checkbox', {name: `Main Contractor mode for ${me.name}`, exact: true}).click(); await page.waitForTimeout(1500);
      check(Array.isArray(site.mc_mode_users) && !site.mc_mode_users.includes('me'), 'unticking yourself takes you off it');
      await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(6000);
      t = await text();
      check(!/Inductions To Do|Fire Roll Call/.test(t) && /Main Contractor/.test(t), 'not ticked: the ordinary job page, with the Main Contractor row');
    } else {
      const bar = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((b) => b.getBoundingClientRect().top > window.innerHeight - 90).map((b) => b.getAttribute('aria-label')).filter(Boolean));
      check(['Today', 'People', 'Check In', 'Permits', 'HUB'].every((x) => bar.includes(x)), `phone: the bottom bar is Today, People, Check In, Permits, HUB (${bar.join(', ')})`);
    }
    await ctx.close();
  }
  // An operative on the same job: the ordinary page.
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    seedJob(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false});
    db.site_assignments.push({id: 'a3', site_id: S1, user_id: 'me'});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(6000);
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(!/Inductions To Do|Fire Roll Call|Our Own Works/.test(t) && /Main Contractor/.test(t), 'an operative: the ordinary job page, with the Main Contractor row');
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
