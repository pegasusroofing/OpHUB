// Subcontractors (Andy, 21 Nov 2026): a subcontractor company's operatives do a company induction (no financial), and their
// site induction fills in from it and signs the site rules and the Construction Phase Plan; a subcontractor operative can
// be invited from Admin only once a subcontractor is set up; the Directory's + New Contact asks Client, Supplier or
// Subcontractor, and a subcontractor goes to Xero like a supplier. Fake database. node subs21-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'subs21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- A subcontractor company's operative ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png', name: 'Jack Turner', phone: '07700 900222'});
    if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
    db.subcontractor_companies = [{id: 'sc1', org_id: me.org_id, site_id: S1, name: 'JT Roofing Ltd', created_at: new Date().toISOString()}];
    db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'sc1', user_id: 'me', is_admin: false}];
    db.company_inductions = []; db.induction_templates = []; db.site_layout_docs = []; db.site_induction_completions = []; db.subcontractor_applications = [];
    const now = new Date().toISOString();
    db.mc_documents = [{id: 'c2', org_id: me.org_id, site_id: S1, category: 'cpp', name: 'Construction Phase Plan v2 - J101', storage_path: `${S1}/cpp/v2.pdf`, uploaded_at: now},
      {id: 'c1', org_id: me.org_id, site_id: S1, category: 'cpp', name: 'Construction Phase Plan v1 - J101 (Superseded by v2)', storage_path: `${S1}/cpp/v1.pdf`, uploaded_at: '2026-11-01T09:00:00Z'}];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(600); };
    await signIn(page);
    await page.goto(`${B}/getting-started`); await page.waitForTimeout(5000);
    let seen = false, form = false;
    for (let i = 0; i < 8 && !seen; i++) { const t = await text(); if (/Fill in your company induction/.test(t)) seen = true; if (/Subcontractor Form/.test(t)) form = true; if (!seen) { const nx = page.getByText('Next ›', {exact: true}); if (!(await nx.count())) break; await nx.click(); await page.waitForTimeout(500); } }
    check(seen && !form, 'Getting Started: "Fill in your company induction", not the Subcontractor Form');
    await page.goto(`${B}/company-induction`); await page.waitForTimeout(5000);
    check(await page.getByLabel('Full Name', {exact: true}).inputValue() === 'Jack Turner' && await page.getByLabel('Mobile', {exact: true}).inputValue() === '07700 900222', 'the company induction starts with their name and mobile');
    await tab(/^Next Of Kin/);
    await page.getByLabel('Name', {exact: true}).fill('Sue Turner');
    await page.getByLabel('Phone Number', {exact: true}).fill('07700 900111');
    await tab(/^Your Work/);
    check(await page.getByLabel('Employer / Company', {exact: true}).inputValue() === 'JT Roofing Ltd', 'Employer / Company is their subcontractor');
    await page.getByLabel('Trade', {exact: true}).fill('Roofer');
    await page.getByLabel('CSCS Card Number', {exact: true}).fill('987654');
    await page.screenshot({path: path.join(SHOTS, 'company-induction-phone.png')});
    await tab(/^Health/);
    await page.getByLabel(/medical condition or allergy.*: No/).click(); await page.waitForTimeout(1200);
    await page.getByText('Finish', {exact: true}).click(); await page.waitForTimeout(2500);
    const ci = db.company_inductions[0];
    check(!!ci && !!ci.completed_at && ci.data.kin_name === 'Sue Turner' && ci.data.about_trade === 'Roofer' && !Object.keys(ci.data).some((k) => /utr|vat|bank|cis/i.test(k)), 'Finish saves it (no financial questions)');
    // The site induction: filled in from it; the plan read and signed with the site rules.
    await page.goto(`${B}/sites/${S1}/mc/inductions`); await page.waitForTimeout(6000);
    check(/filled in from your company induction/.test(await text()), 'the site induction says it is filled in from their company induction');
    await tab(/^Next Of Kin/);
    check(await page.getByLabel('Name', {exact: true}).inputValue() === 'Sue Turner', 'next of kin carried in');
    await tab(/^About You/);
    check(await page.getByLabel('Trade', {exact: true}).inputValue() === 'Roofer' && await page.getByLabel('CSCS Card Number', {exact: true}).inputValue() === '987654', 'trade and CSCS card carried in');
    await tab(/^Sign/);
    const t = await text();
    check(/Construction Phase Plan v2 - J101/.test(t) && !/Superseded/.test(t) && /read and understood the Construction Phase Plan/.test(t), 'Sign: the current Construction Phase Plan to read, and the tick covers it');
    await page.screenshot({path: path.join(SHOTS, 'site-induction-sign-phone.png'), fullPage: true});
    await ctx.close();
  }
  // ---- Our admin: invites and the Directory ----
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.profiles[0].role = 'admin';
    const O = db.organizations[0].id, site = db.sites[0];
    db.subcontractor_companies = [];
    const rpcs = [], fns = [];
    global.__rpc = (n, b) => { rpcs.push([n, b]); return n === 'sub_invite_create' ? {ok: true, invite_id: 'inv-sub-1'} : undefined; };
    global.__fn = (name, b) => { fns.push([name, b]); if (name !== 'xero') return {ok: true}; if (b.action === 'status') return {configured: true, connected: true}; if (b.action === 'create_contact') return {ok: true, contact: {id: '12121212-3434-5656-7878-909090909090', name: b.name}}; return {ok: true}; };
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await signIn(page);
    await page.goto(`${B}/pm/admin/invites`); await page.waitForTimeout(5000);
    await page.getByText(/^Invite As:/).first().click(); await page.waitForTimeout(700);
    check(!/Subcontractor Operative/.test(await text()), 'no subcontractor set up: no Subcontractor Operative to invite');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    db.subcontractor_companies = [{id: 'sc9', org_id: O, site_id: site.id, name: 'Slate & Tile Co', created_at: new Date().toISOString()}];
    await page.goto(`${B}/pm/admin/invites`); await page.waitForTimeout(5000);
    await page.getByText(/^Invite As:/).first().click(); await page.waitForTimeout(700);
    await page.getByText('Subcontractor Operative', {exact: true}).last().click(); await page.waitForTimeout(600);
    await page.getByLabel('Which Subcontractor').click(); await page.waitForTimeout(600);
    await page.getByText(/^Slate & Tile Co · /).last().click(); await page.waitForTimeout(500);
    await page.getByText('Generate One-Time Invite Link', {exact: true}).click(); await page.waitForTimeout(2000);
    const made = rpcs.find(([n]) => n === 'sub_invite_create');
    check(!!made && made[1].p_company === 'sc9' && /inv-sub-1/.test(await page.locator('body').innerHTML()), 'with one set up: Subcontractor Operative, choose the subcontractor, and the link puts them into it');
    await page.screenshot({path: path.join(SHOTS, 'invite-sub-operative-laptop.png')});
    // Directory: + New Contact › Subcontractor.
    await page.goto(`${B}/fin/directory?kind=client`); await page.waitForTimeout(5000);
    const tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => x.trim());
    check(tabs.includes('Subcontractors') && !tabs.includes('Labour (CIS)'), `Directory tabs: Clients, Suppliers, Subcontractors (${tabs.join(' | ')})`);
    await page.getByText('+ New Contact', {exact: true}).first().click(); await page.waitForTimeout(700);
    let t = await text();
    check(/Client · We Invoice Them/.test(t) && /Supplier · We Buy From Them/.test(t) && /Subcontractor · They Work For Us \(CIS\)/.test(t), '+ New Contact asks: Client, Supplier or Subcontractor');
    await page.getByText('Subcontractor · They Work For Us (CIS)', {exact: true}).click(); await page.waitForTimeout(3000);
    t = await text();
    check(/kind=labour/.test(page.url()) && /New Subcontractor/.test(t) && ['Contact', 'Address', 'CIS And Tax', 'Bank Details And Rate'].every((h) => t.includes(h)) && /Add To Xero As Well/.test(t), 'Subcontractor opens their form: Contact, Address, CIS And Tax, Bank Details, Add To Xero As Well');
    await page.getByLabel('Name', {exact: true}).fill('Dana Newfixer');
    await page.getByLabel('Trading / Company Name', {exact: true}).fill('Fixer Roofing');
    await page.getByLabel('UTR (10 Numbers)', {exact: true}).fill('1234567890');
    await page.getByLabel('Sort Code', {exact: true}).fill('112233');
    await page.getByLabel('Bank Account Number', {exact: true}).fill('87654321');
    await page.getByLabel('Mobile', {exact: true}).fill('07700 900333');
    await page.screenshot({path: path.join(SHOTS, 'new-subcontractor-laptop.png'), fullPage: true});
    await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(3000);
    const w = (db.fin_labour_rates || []).find((x) => x.name === 'Dana Newfixer');
    const cr = fns.find(([n, b]) => n === 'xero' && b.action === 'create_contact');
    check(!!w && w.utr === '1234567890' && w.bank_sort_code === '11-22-33' && w.mobile === '07700 900333' && w.xero_contact_id === '12121212-3434-5656-7878-909090909090', `saved with UTR, bank and mobile, and linked to its new Xero contact (${w ? [w.utr, w.bank_sort_code, w.mobile, w.xero_contact_id].join(' / ') : 'no row'})`);
    check(!!cr && cr[1].supplier === true && cr[1].name === 'Fixer Roofing' && cr[1].bank_account_number === '87654321', 'sent to Xero as a supplier, under its trading name, with bank details');
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
