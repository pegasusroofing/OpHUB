// Three of Andy's asks (21 Nov 2026), fake database. node f10ind21-check.js
// 1. CPP: "if it is saved as the template for company the save as company template button shouldn't be there. Move the
//    edit and delete button into an ellipsis".
// 2. "In f10 area have a row with a tick box for not required and then once ticked it closed the f10 section (admin/pm
//    can open and change but whilst it's not required no one else sees it)".
// 3. "The about you in the induction form should auto pull from the operatives sign up, even next of kin should be a
//    question in the sign up".
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'f10ind21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- A manager: the CPP's ⋮ and template button; the F10 tick box ----
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    const now = new Date().toISOString();
    db.cpp_defaults = []; db.mc_documents = [];
    db.cpp_plans = [{id: 'cp2', org_id: me.org_id, site_id: S1, title: 'Construction Phase Plan', status: 'issued', version: 1, updated_at: now, mc_document_id: 'md1',
      data: {siteName: 'J101 Studley Rd', revisions: [{version: 1, date: now.slice(0, 10), by: 'Andy Admin', note: 'First issue', docId: 'md1', path: 'x/cpp-v1.pdf'}]}}];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await signIn(page);
    await page.goto(`${B}/sites/${S1}/mc/cpp/cp2`); await page.waitForTimeout(6000);
    let t = await text();
    check(/Construction Phase Plan · Version 1/.test(t) && /⬇ Export/.test(t) && /👁 View/.test(t) && !/✎ Edit/.test(t) && !/Delete This Plan/.test(t) && await page.getByLabel('More for this plan').count() === 1, 'CPP: the issued plan has Export / Email / View and a ⋮; no Edit or Delete buttons');
    check(/Save As Company Template/.test(t), 'CPP: Save As Company Template shows while the plan isn\'t the template');
    await page.getByLabel('More for this plan').click(); await page.waitForTimeout(700);
    t = await text();
    check(/✎ Edit/.test(t) && /🗑 Delete This Plan/.test(t), 'CPP: the ⋮ has Edit and Delete This Plan');
    await page.screenshot({path: path.join(SHOTS, 'cpp-menu-laptop.png')});
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    if (/🗑 Delete This Plan/.test(await text())) { await page.mouse.click(5, 5); await page.waitForTimeout(400); }
    await page.goto(`${B}/sites/${S1}/mc/cpp/cp2`); await page.waitForTimeout(6000);
    await page.getByText('Save As Company Template', {exact: true}).click(); await page.waitForTimeout(800);
    await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(3000);
    t = await text();
    check(db.cpp_defaults.length === 1 && !/Save As Company Template/.test(t), 'CPP: once saved as the template, the button goes');
    await page.goto(`${B}/sites/${S1}/mc/cpp/cp2`); await page.waitForTimeout(6000);
    check(!/Save As Company Template/.test(await text()), 'CPP: and stays gone when the plan is opened again');
    await page.screenshot({path: path.join(SHOTS, 'cpp-issued-laptop.png')});

    // F10: tick Not Required.
    await page.goto(`${B}/sites/${S1}/mc/docs/f10`); await page.waitForTimeout(5000);
    t = await text();
    check(/F10 Not Required On This Job/.test(t) && /Upload F10 Notification/.test(t), 'F10: a Not Required tick box at the top; the folder is open');
    await page.getByRole('checkbox', {name: /F10 Not Required/}).click(); await page.waitForTimeout(2500);
    const site = db.sites.find((s) => s.id === S1);
    t = await text();
    check(site.f10_not_required === true && !/Upload F10 Notification/.test(t) && /Open The F10 Folder/.test(t) && /only Project Managers and admins see the F10/.test(t), 'F10: ticked, it saves and the folder closes (Open The F10 Folder to look)');
    await page.screenshot({path: path.join(SHOTS, 'f10-not-required-laptop.png')});
    await page.getByText('Open The F10 Folder', {exact: true}).click(); await page.waitForTimeout(800);
    check(/Upload F10 Notification/.test(await text()), 'F10: a manager can still open it');
    await page.goto(`${B}/sites/${S1}/mc`); await page.waitForTimeout(6000);
    t = await text();
    check(/F10 Notification Not required on this job/.test(t), 'F10: the Main Contractor page row says Not required on this job');
    check(/F10 Notification Not Required/.test(t), 'F10: the set-up list counts it, marked Not Required');
    await page.screenshot({path: path.join(SHOTS, 'mc-page-laptop.png')});
    await ctx.close();
  }
  // ---- An operative: the F10 hidden even when shown to them; the induction filled in from the sign-up form ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png', name: 'Jack Turner'});
    if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
    const site = db.sites.find((s) => s.id === S1); Object.assign(site, {f10_not_required: true, mc_shown_tiles: ['f10', 'asbestos']});
    db.induction_templates = []; db.site_layout_docs = []; db.subcontractor_operatives = []; db.site_induction_completions = [];
    db.subcontractor_applications = [{id: 'sa1', org_id: me.org_id, user_id: 'me', status: 'submitted', created_at: new Date().toISOString(), company_name: 'JT Roofing Ltd', contact_name: 'Jack Turner',
      data: {company_name: 'JT Roofing Ltd', trades: ['Leadwork'], kin_name: 'Sue Turner', kin_relationship: 'Wife', kin_phone: '07700 900111', operatives: 'Jack Turner — Roofer — 123456 — 05/03/2028'}}];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(600); };
    await signIn(page);
    await page.goto(`${B}/sites/${S1}/mc`); await page.waitForTimeout(6000);
    let t = await text();
    check(/Asbestos Register/.test(t) && !/F10/.test(t), 'operative: the F10 isn\'t listed while not required (the Asbestos Register, also shown to them, is)');
    await page.goto(`${B}/sites/${S1}/mc/docs/f10`); await page.waitForTimeout(5000);
    check(!/\/mc\/docs\/f10/.test(page.url()), `operative: a link to the F10 is turned away (${page.url().replace(B, '')})`);
    await page.goto(`${B}/sites/${S1}/mc/inductions`); await page.waitForTimeout(6000);
    check(/filled in from your sign-up form/.test(await text()), 'induction: it says next of kin and details come from their sign-up form');
    await tab(/^Next Of Kin/);
    check(await page.getByLabel('Name', {exact: true}).inputValue() === 'Sue Turner' && await page.getByLabel('Relationship To You', {exact: true}).inputValue() === 'Wife' && await page.getByLabel('Phone Number', {exact: true}).inputValue() === '07700 900111', 'induction: next of kin filled in from the sign-up form');
    await tab(/^About You/);
    check(await page.getByLabel('Employer / Company', {exact: true}).inputValue() === 'JT Roofing Ltd' && await page.getByLabel('Trade', {exact: true}).inputValue() === 'Roofer' && await page.getByLabel('CSCS Card Number', {exact: true}).inputValue() === '123456' && /05\/03\/2028|5 Mar 2028|05 Mar 2028/.test(await text()), 'induction: About You filled in (employer, trade, CSCS card and expiry)');
    await page.screenshot({path: path.join(SHOTS, 'induction-about-you-phone.png')});
    db.subcontractor_applications = []; // a new operative, who hasn't sent theirs yet
    await page.goto(`${B}/subform`); await page.waitForTimeout(6000);
    check(await page.getByRole('tab').filter({hasText: /^Next Of Kin$/}).count() === 1, 'sign-up form: a Next Of Kin tab, after Main Contact');
    await tab(/^Next Of Kin$/);
    t = await text();
    check(/Next Of Kin Name/.test(t) && /Relationship To You/.test(t) && /Their Phone Number/.test(t) && /Their Address/.test(t), 'sign-up form: Next Of Kin asks name, relationship, phone and address');
    await page.screenshot({path: path.join(SHOTS, 'signup-next-of-kin-phone.png')});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
