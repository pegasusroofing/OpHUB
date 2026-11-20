// A subcontractor's Project Manager sets up their company (Andy, 20 Nov 2026: "the subcontractors need a project manager by
// default who sets up their company and their view needs to be like our project managers, ie they upload rams etc etc (dont
// give them options to build just upload their own, same with coshh, tbt etc)"), and snags given to the company ("yes snags
// issued to the subcontract company please (all operatrives for them then see it)"). Their PM and an operative on a phone,
// our PM on a laptop, and the join page. Fake database (the database rules are proved in SQL file 11).
// node subpm20-check.js — pictures in shots/subpm20.
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'subpm20'); require('fs').mkdirSync(SHOTS, {recursive: true});
const now = new Date().toISOString();
// The whole page in one picture: the app scrolls inside itself, so grow the window to fit, then put it back.
const shot = async (page, name) => {
  const vp = page.viewportSize();
  const extra = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('div')].filter((d) => /(auto|scroll)/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight).map((d) => d.scrollHeight - d.clientHeight)));
  await page.setViewportSize({width: vp.width, height: Math.min(vp.height + extra + 20, 3200)}); await page.waitForTimeout(800);
  await page.screenshot({path: path.join(SHOTS, name)});
  await page.setViewportSize(vp); await page.waitForTimeout(300);
};

function seed(db, meIsPm) {
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {name: meIsPm ? 'Dan Price' : 'Liam Walsh', role: 'operative', howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  const O = me.org_id;
  db.profiles.push({id: 'op2', name: meIsPm ? 'Liam Walsh' : 'Dan Price', role: 'operative', org_id: O, email: 'l@x.co'});
  for (const u of ['me', 'op2']) if (!db.site_assignments.some((a) => a.user_id === u && a.site_id === S1)) db.site_assignments.push({id: 'sa-' + u, site_id: S1, user_id: u});
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: now}, {id: 'co2', org_id: O, site_id: S1, name: 'Acme Scaffolding', created_at: now}];
  db.subcontractor_operatives = [
    {id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: meIsPm},
    {id: 'so2', site_id: S1, subcontractor_company_id: 'co1', user_id: 'op2', is_admin: !meIsPm},
  ];
  db.snags = [
    {id: 'sn1', site_id: S1, title: 'Fascia touch-up, rear elevation', location: 'Rear', status: 'open', subcontractor_company_id: 'co1', created_by: 'pm', created_at: now, tagged: []},
    {id: 'sn2', site_id: S1, title: 'Loose ridge tile', location: 'Front', status: 'open', subcontractor_company_id: null, created_by: 'pm', created_at: now, tagged: []},
  ];
  db.handover_om_manuals = []; db.messages = db.messages || [];
  return me;
}

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const calls = [];
  const invites = [];
  global.__rpc = (n, b) => {
    calls.push({n, b});
    if (n === 'sub_invite_create') { const id = 'inv-' + (invites.length + 1); invites.push({id, email: b.p_email, subcontractor_admin: !!b.p_admin, created_at: now, expires_at: new Date(Date.now() + 14 * 864e5).toISOString()}); return {ok: true, invite_id: id}; }
    if (n === 'sub_invites_open') return invites;
    if (n === 'sub_invite_cancel') { const i = invites.findIndex((x) => x.id === b.p_invite_id); if (i >= 0) invites.splice(i, 1); return true; }
    if (n === 'sub_remove_operative') return true;
    if (n === 'get_invite_info') return [{org_name: 'RTB Roofing Ltd', is_valid: true}];
    if (n === 'sub_invite_info') return {company: 'Pro Finish Decorators Ltd', site: 'J101 Studley Rd', admin: false};
    return undefined;
  };
  const signIn = async (page) => {
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  };

  // ---- Their Project Manager, on a phone ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    seed(db, true);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await signIn(page);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
    let t = await text();
    check(/You.re Pro Finish Decorators Ltd.s Project Manager on this job/.test(t), 'their PM: the company page says they are its Project Manager');
    check(/Snags 1 open/.test(t) && /Add your operatives/.test(t) && /Handover/.test(t) && /RAMS/.test(t) && /COSHH/.test(t) && /TBT/.test(t), 'their PM: RAMS, COSHH, TBT, Snags (1 open), Operatives and Handover tiles');
    await shot(page, '1-their-pm-company-page-phone.png');

    // Upload only: no builders or signing templates.
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/docs?kind=rams`); await page.waitForTimeout(4500);
    t = await text();
    check(/Upload/i.test(t) && !/Multi-page sign required|Signing template|Build/i.test(t), 'their PM: RAMS is upload only (no builder, no signing templates)');

    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/operatives`); await page.waitForTimeout(4500);
    t = await text();
    check(/On This Job \(2\)/i.test(t) && /Dan Price \(You\)/.test(t) && /⭐ Project Manager/.test(t) && /Liam Walsh/.test(t), 'their PM: sees everyone in their company, with themself as Project Manager');
    check(/Add Your Operatives/i.test(t) && !/Is This For Their Project Manager/i.test(t) && !/Allocate Someone/i.test(t), 'their PM: Add Your Operatives (no Project Manager question, no allocating)');
    await page.getByPlaceholder(/Their email/).fill('liam.new@example.com');
    await page.getByText('Make Join Link', {exact: true}).click(); await page.waitForTimeout(2500);
    const mk = calls.find((c) => c.n === 'sub_invite_create');
    check(!!mk && mk.b.p_company === 'co1' && mk.b.p_admin === false && mk.b.p_email === 'liam.new@example.com', 'their PM: Make Join Link makes an operative link for their company');
    t = await text();
    check(await page.locator('input[value*="/join/inv-1"]').count() > 0 && /Waiting To Join \(1\)/i.test(t) && /liam.new@example.com/.test(t), 'the link shows, and the invite is listed under Waiting To Join');
    await shot(page, '2-their-pm-operatives-phone.png');
    // Take an operative off.
    const rm = page.getByRole('button', {name: 'Remove', exact: true});
    check(await rm.count() === 1, 'their PM: Remove only on their operative (not on themself)');
    await rm.first().click(); await page.waitForTimeout(600);
    await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(1500);
    check(calls.some((c) => c.n === 'sub_remove_operative' && c.b.p_row === 'so2'), 'their PM: Remove takes the operative off the job');

    // Their snags.
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/snags`); await page.waitForTimeout(5000);
    t = await text();
    check(/Fascia touch-up, rear elevation/.test(t) && !/Loose ridge tile/.test(t), 'their Snags tile: only the snags given to them');
    check(!/\+ Add Snag/.test(t), 'their Snags: no Add Snag (our managers raise them)');
    await page.getByText('Fascia touch-up, rear elevation').first().click(); await page.waitForTimeout(600);
    check(/Close Snag/.test(await text()), 'their Snags: they can close one');
    await shot(page, '3-their-snags-phone.png');
    await ctx.close();
  }

  // ---- One of their operatives, on a phone ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    seed(db, false);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await signIn(page);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
    let t = await text();
    check(!/Project Manager on this job/.test(t) && !/Handover/.test(t) && /Check In \/ Out/.test(t) && /Snags 1 open/.test(t), 'their operative: Check In, Snags and the rest; no Handover; not told they are the PM');
    await shot(page, '4-their-operative-company-page-phone.png');
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/operatives`); await page.waitForTimeout(4500);
    t = await text();
    check(/Dan Price/.test(t) && /⭐ Project Manager/.test(t) && !/Add Your Operatives|Make Join Link|Remove/i.test(t), 'their operative: sees who is in the company, can’t add or remove');
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/snags`); await page.waitForTimeout(4500);
    check(/Fascia touch-up, rear elevation/.test(await text()), 'their operative: sees the company’s snags too');
    await ctx.close();
  }

  // ---- Our PM, on a laptop ----
  {
    const {ctx, db} = await makeContext(browser, 'pm', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'pm', howto_dismissed: ['*']});
    const O = me.org_id;
    db.profiles.push({id: 'op2', name: 'Liam Walsh', role: 'operative', org_id: O, email: 'l@x.co'});
    db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: now}];
    db.subcontractor_operatives = [{id: 'so2', site_id: S1, subcontractor_company_id: 'co1', user_id: 'op2', is_admin: false}];
    db.snags = []; db.messages = [];
    invites.length = 0; calls.length = 0;
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await signIn(page);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1`); await page.waitForTimeout(5000);
    check(/No Project Manager for Pro Finish Decorators Ltd yet/.test(await text()), 'our PM: told the company has no Project Manager yet');
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/operatives`); await page.waitForTimeout(4500);
    let t = await text();
    check(/Invite Their Project Manager/i.test(t) && /Is This For Their Project Manager/i.test(t), 'our PM: Invite Their Project Manager, with the Yes / No');
    await page.getByText('Make Join Link', {exact: true}).click(); await page.waitForTimeout(2500);
    check(calls.some((c) => c.n === 'sub_invite_create' && c.b.p_admin === true), 'our PM: the first link is for their Project Manager');
    await shot(page, '5-our-pm-operatives-laptop.png');

    // Give a snag to the company.
    await page.goto(`${B}/sites/${S1}/snagging/list`); await page.waitForTimeout(5000);
    await page.getByText('+ Add Snag', {exact: true}).click(); await page.waitForTimeout(700);
    await page.locator('text="Issue *" >> xpath=following::*[self::input or self::textarea][1]').first().fill('Paint run on soffit');
    await page.getByText('👷 Give To ▾', {exact: true}).last().click(); await page.waitForTimeout(600);
    await page.getByText('👷 Pro Finish Decorators Ltd', {exact: true}).last().click(); await page.waitForTimeout(600);
    t = await text();
    check(/Given To: Pro Finish Decorators Ltd/.test(t), 'our PM: Add Snag › Give To picks the company');
    await page.screenshot({path: path.join(SHOTS, '6-our-pm-add-snag-laptop.png')});
    await page.getByText('Add Snag', {exact: true}).last().click(); await page.waitForTimeout(2500);
    const sn = db.snags.find((x) => x.title === 'Paint run on soffit');
    check(!!sn && sn.subcontractor_company_id === 'co1', 'the snag is saved as given to the company');
    check(db.messages.some((m) => m.recipient_id === 'op2' && /was given to Pro Finish Decorators Ltd/.test(m.body)), 'everyone in the company is told');
    check(/👷 Pro Finish Decorators Ltd/.test(await text()), 'the snag list shows who it is given to');
    await ctx.close();
  }

  // ---- The join page, from their link ----
  {
    const {ctx} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${B}/join/inv-1`); await page.waitForTimeout(5000);
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/invited to work with Pro Finish Decorators Ltd on J101 Studley Rd for RTB Roofing Ltd/.test(t), 'the join page says which subcontractor and job');
    await page.screenshot({path: path.join(SHOTS, '7-join-page-phone.png')});
    await ctx.close();
  }
  global.__rpc = undefined;
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
