// A subcontractor's orders and variations (Andy, 21 Nov 2026: "can we create a subcontractor order through the main
// contractor tab ... will it auto track the job. Can we have multiple orders within there selected to track. Can we add
// variations in there which add to the existing po raised, providing it's approved? Can subcontractors raise variation
// requests"). Fake database; the database functions are answered by the harness as the real ones do. node subvar21-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'subvar21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const seed = (db) => {
  require('./seeds/world')(db);
  const O = db.profiles.find((p) => p.id === 'me').org_id; const now = new Date().toISOString();
  db.subcontractor_companies = [{id: 'sc1', org_id: O, site_id: S1, name: 'Slate & Tile Co', created_at: now}];
  db.fin_subcontracts = [
    {id: 'fs1', org_id: O, site_id: S1, number: 'SC-001', name: 'Slate & Tile Co', order_value: 20000, retention_pct: 5, status: 'active', subcontractor_company_id: 'sc1', created_at: now},
    {id: 'fs2', org_id: O, site_id: S1, number: 'SC-002', name: 'Slate & Tile Co (Leadwork)', order_value: 5000, retention_pct: 5, status: 'active', subcontractor_company_id: null, created_at: now},
  ];
  db.fin_sub_apps = [];
  db.fin_sub_variations = [{id: 'v1', org_id: O, site_id: S1, subcontractor_company_id: 'sc1', subcontract_id: null, title: 'Extra Flashing To Dormers', description: 'Six dormers', value: 750, status: 'requested', requested_by: 's1', requested_at: now}];
  return O;
};
const fakeRpc = (db, O, calls) => (n, b) => {
  calls.push([n, b]);
  if (n === 'sub_orders_for_company') return db.fin_subcontracts.filter((s) => s.site_id === b.p_site && (!s.subcontractor_company_id || s.subcontractor_company_id === b.p_company)).map((s) => ({id: s.id, number: s.number, name: s.name, status: s.status, order_value: s.order_value, tracked: s.subcontractor_company_id === b.p_company}));
  if (n === 'sub_order_track') { const s = db.fin_subcontracts.find((x) => x.id === b.p_subcontract); if (!s) return false; s.subcontractor_company_id = b.p_on ? b.p_company : null; return true; }
  if (n === 'site_save_subcontract') { db.fin_subcontracts.push({id: 'fs3', org_id: O, site_id: b.p_site, number: 'SC-003', name: b.p_name, description: b.p_description, status: 'active', order_value: null, subcontractor_company_id: null, created_at: new Date().toISOString()}); return {ok: true}; }
  if (n === 'sub_variation_decide') {
    const v = db.fin_sub_variations.find((x) => x.id === b.p_id);
    if (b.p_approve) { const s = db.fin_subcontracts.find((x) => x.id === b.p_subcontract); s.order_value += v.value; Object.assign(v, {status: 'approved', subcontract_id: s.id, added_to_order: v.value}); }
    else Object.assign(v, {status: 'declined', decline_reason: b.p_reason});
    return {ok: true};
  }
  return undefined;
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const login = async (page) => {
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  };
  // ---- Our Project Manager (admin, Finance on) ----
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    const O = seed(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], finance_enabled: true});
    Object.assign(db.organizations.find((o) => o.id === O) || db.organizations[0], {has_finance: true});
    const calls = []; global.__rpc = fakeRpc(db, O, calls);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await login(page);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/sc1?tab=work`); await page.waitForTimeout(6000);
    let t = await text();
    check(/Subcontract Orders/.test(t) && /1 tracked here/.test(t) && /Variations/.test(t) && /1 waiting for approval/.test(t), 'their Work tab: Subcontract Orders (1 tracked) and Variations (1 waiting)');
    await page.getByText('Subcontract Orders', {exact: true}).first().click(); await page.waitForTimeout(4000);
    t = await text();
    check(/SC-001/.test(t) && /SC-002/.test(t) && /£20,000/.test(t), 'Subcontract Orders lists the job\'s orders with their values');
    await page.getByRole('checkbox', {name: /Track SC-002/}).click(); await page.waitForTimeout(1500);
    check(db.fin_subcontracts.find((x) => x.id === 'fs2').subcontractor_company_id === 'sc1', 'ticking a second order tracks it on their page');
    await page.screenshot({path: path.join(SHOTS, 'orders-laptop.png')});
    await page.getByText('+ Raise A Subcontract Order', {exact: true}).click(); await page.waitForTimeout(800);
    await page.getByPlaceholder('e.g. Slating and tiling, main roof').fill('Ridge and hips'); await page.getByText('Raise Order', {exact: true}).last().click(); await page.waitForTimeout(4000);
    const fs3 = db.fin_subcontracts.find((x) => x.id === 'fs3');
    check(!!fs3 && fs3.name === 'Slate & Tile Co' && fs3.subcontractor_company_id === 'sc1' && /\/fin\/sub\/fs3/.test(page.url()), `raising one here tracks it for them and opens it in Finance to add its value (${page.url().replace(B, '')})`);
    // Variations: approve onto an order of our choosing.
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/sc1/variations`); await page.waitForTimeout(5000);
    t = await text();
    check(/Waiting For Approval \(1\)/i.test(t) && /Extra Flashing To Dormers/.test(t) && /£750/.test(t) && /Approve/.test(t), 'Variations: the request, its value, Approve / Decline');
    await page.getByText('Approve', {exact: true}).first().click(); await page.waitForTimeout(800);
    check(/Add It To Which Order/.test(await text()), 'with more than one order tracked, it asks which order');
    await page.getByText(/^SC-001/).last().click(); await page.waitForTimeout(700);
    await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(2500);
    const v1 = db.fin_sub_variations[0];
    check(v1.status === 'approved' && v1.subcontract_id === 'fs1' && db.fin_subcontracts.find((x) => x.id === 'fs1').order_value === 20750, 'approved: £750 added to SC-001 (now £20,750)');
    await page.screenshot({path: path.join(SHOTS, 'variations-laptop.png'), fullPage: true});
    // The updated order: offered straight after approving; while Finance is on trial it's downloaded, not emailed.
    let tt = await text();
    check(/is now a VO on SC-001/.test(tt) && /Send the updated order to Slate & Tile Co\?/.test(tt), 'after approving it offers to send the updated order');
    // On a laptop the PDF opens in the app's viewer (download / OneDrive from there); on trial nothing is emailed.
    await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(3000);
    tt = await text();
    check(/Subcontract Order SC-001 Rev 1 - Slate & Tile Co/.test(tt), `the updated order is made as Revision 1, to send yourself while Finance is on trial (${tt.slice(-200)})`);
    await page.screenshot({path: path.join(SHOTS, 'order-pdf-laptop.png')});
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await page.goto(`${B}/fin/sub/fs1`); await page.waitForTimeout(6000);
    tt = await text();
    check(/Revised Order Value/.test(tt) && /Original £20,000/.test(tt) && /VO1/.test(tt) && /Extra Flashing To Dormers/.test(tt) && /Revised Order/.test(tt) && /Resend Order/.test(tt), `Finance's order: Revised Order Value, the original, VO1 listed, Resend Order (${page.url().replace(B, '')}: ${tt.slice(0, 400)})`);
    await page.screenshot({path: path.join(SHOTS, 'order-vos-laptop.png'), fullPage: true});
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/sc1`); await page.waitForTimeout(6000);
    check(/incl\. £750 variations/.test(await text()), 'the money tiles\' Order Value says it includes £750 of variations');
    // Main Contractor mode's Today: a new request shows to approve.
    db.fin_sub_variations.push({id: 'v2', org_id: O, site_id: S1, subcontractor_company_id: 'sc1', subcontract_id: null, title: 'Replace Rotten Fascia', value: 320, status: 'requested', requested_by: 's1', requested_at: new Date().toISOString()});
    await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(7000);
    check(/Approve Variation: Replace Rotten Fascia/.test(await text()), 'Main Contractor mode\'s Today lists the variation to approve');
    await ctx.close();
  }
  // ---- The subcontractor's own Project Manager ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    const O = seed(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false});
    db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'sc1', user_id: 'me', is_admin: true}];
    if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
    const calls = []; global.__rpc = fakeRpc(db, O, calls);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await login(page);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/sc1/variations`); await page.waitForTimeout(6000);
    let t = await text();
    check(/\+ Request A Variation/.test(t) && !/Approve/.test(t.replace(/approval/gi, '')), 'their Project Manager: Request A Variation, no Approve');
    await page.getByText('+ Request A Variation', {exact: true}).click(); await page.waitForTimeout(600);
    await page.getByLabel('What Is It?').fill('Scaffold Adaption For Chimney');
    await page.getByLabel('Value £').fill('480');
    await page.getByText('Send For Approval', {exact: true}).click(); await page.waitForTimeout(2500);
    const v = db.fin_sub_variations.find((x) => x.title === 'Scaffold Adaption For Chimney');
    t = await text();
    check(!!v && v.status === 'requested' && Number(v.value) === 480 && v.subcontractor_company_id === 'sc1' && /Waiting For Approval \(2\)/i.test(t), `their request is sent for approval (${v ? [v.status, v.value, v.subcontractor_company_id].join(' / ') : 'none: ' + t.slice(0, 200)})`);
    await page.screenshot({path: path.join(SHOTS, 'request-phone.png'), fullPage: true});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
