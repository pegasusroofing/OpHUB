// A PM without Finance does the job's orders in Projects (Andy, 8 Nov 2026: "Finance is purely the monetary element").
// On the fake database, laptop, signed in as a PM with no Finance: Client Info — the client's PO (number, date, the PO
// file, into Finance's own folder) and, with the client set up in Finance, the contact still editable but not the name;
// Plant — hired plant put on hire and off hire (no rate); Materials › Subcontract Orders — raised from the company's
// subcontractors (who and the scope, no value); Material PO's — the job's POs with no prices, lines taken off and a PO
// cancelled. The database functions behind these were checked on Sandbox (rolled back). node pm-orders-check.js
const path = require('path');
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'pm', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.profiles[0].role = 'pm'; db.profiles[0].finance_enabled = false;
  const O = db.organizations[0].id;
  Object.assign(db.sites.find((s) => s.id === S1), {client_name: 'Bellway Homes', client_contact_name: 'Sam Site', client_email: 'sam@bellway.example'});
  db.client_pos = [];
  const hires = [], subs = [], calls = [];
  const pos = [
    {id: 'po1', number: 'J101-PO-001', supplier_name: 'SIG Roofing', supplier_branch: null, required_by: '2026-11-12', fulfilment: 'delivery', status: 'open', sent_at: null, source: 'materials', note: null, ordered_by_name: 'Paula PM', created_at: '2026-11-07T09:00:00Z', items: [{item: 'Slate 500x250', qty: '400', material_id: 'm1'}, {item: 'Lead code 4', qty: '2', material_id: 'm2'}], received: {}, invoiced: false},
    {id: 'po2', number: 'J101-PO-002', supplier_name: 'Travis Perkins', supplier_branch: null, required_by: '2026-11-05', fulfilment: 'delivery', status: 'invoiced', sent_at: null, source: 'materials', note: null, ordered_by_name: 'Paula PM', created_at: '2026-11-03T09:00:00Z', items: [{item: 'Battens', qty: '50'}], received: {}, invoiced: true},
  ];
  global.__rpc = (name, b) => {
    calls.push([name, b]);
    if (name === 'site_client_from_finance') return true;
    if (name === 'site_plant_hires') return hires;
    if (name === 'site_save_plant_hire') { if (b.p_id) Object.assign(hires.find((h) => h.id === b.p_id), {off_hire: b.p_off}); else hires.push({id: 'h1', item: b.p_item, supplier_name: b.p_supplier, hire_ref: b.p_ref, on_hire: b.p_on, off_hire: b.p_off, notes: b.p_notes, created_at: '2026-11-08T09:00:00Z', costed: false}); return 'h1'; }
    if (name === 'site_subcontracts') return subs;
    if (name === 'site_sub_people') return [{id: 'w1', name: 'Leadline Ltd', email: 'jobs@leadline.example'}];
    if (name === 'site_save_subcontract') { subs.push({id: 's1', number: 'SC-001', name: b.p_name, email: b.p_email, description: b.p_description, status: 'active', notes: b.p_notes, created_at: '2026-11-08T09:00:00Z', worker_id: b.p_worker, valued: false, source: 'projects'}); return 's1'; }
    if (name === 'site_purchase_orders') return pos;
    if (name === 'site_po_amend') { pos[0].items = pos[0].items.filter((_, i) => !(b.p_drop || []).includes(i)); return {removed: (b.p_drop || []).length, cancelled: 1}; }
    if (name === 'site_po_cancel') { pos[0].status = 'cancelled'; return 1; }
    return undefined;
  };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Client Info: the client's PO, the contact ----
  await page.goto(`${BASE}/sites/${S1}/client`); await page.waitForTimeout(4500);
  let t = await text();
  check(/CLIENT PO/.test(t) && /No client PO yet/.test(t), 'Client Info: a Client PO card, none yet');
  check(/its name is changed there/.test(t) && await page.getByRole('button', {name: 'Edit The Contact'}).count() === 1, 'client set up in Finance: the contact can still be changed here');
  await page.getByRole('button', {name: 'Edit The Contact'}).click(); await page.waitForTimeout(500);
  check(await page.getByLabel('Client Name').count() === 0, 'the client’s name isn’t editable');
  await page.getByPlaceholder('Optional').first().fill('Sam Site-Manager'); await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(1500);
  const s1 = db.sites.find((s) => s.id === S1);
  check(s1.client_contact_name === 'Sam Site-Manager' && s1.client_name === 'Bellway Homes', 'the contact saved, the name left alone');
  await page.getByRole('button', {name: '+ Add Client PO'}).click(); await page.waitForTimeout(600);
  await page.getByLabel('PO Number').fill('BW-55120');
  const fc = page.waitForEvent('filechooser'); await page.getByLabel('Attach PO files').click(); await (await fc).setFiles([path.join(__dirname, 'shots', 'samples', 'sample.pdf')]); await page.waitForTimeout(500);
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const cpo = db.client_pos[0];
  check(!!cpo && cpo.po_number === 'BW-55120' && cpo.site_id === S1 && cpo.is_primary === true && Array.isArray(cpo.files) && String(cpo.files[0]?.path || '').startsWith(`${O}/${S1}/client-po/`), `the PO saved with its file in Finance's folder (${cpo ? JSON.stringify(cpo.files) : 'none'})`);
  t = await text();
  check(/PO BW-55120/.test(t) && /sample\.pdf/.test(t) && !/£/.test(t), 'shown on Client Info, no money');
  await page.screenshot({path: 'shots/pm-client-po.png'});

  // ---- Plant: hired plant ----
  await page.goto(`${BASE}/sites/${S1}/plant`); await page.waitForTimeout(4500);
  check(/HIRED PLANT/.test(await text()), 'Plant: a Hired Plant card for managers');
  await page.getByRole('button', {name: '+ Plant On Hire'}).click(); await page.waitForTimeout(600);
  await page.getByLabel('What’s On Hire').fill('Cherry picker 12m'); await page.getByLabel('Supplier').fill('GAP Hire'); await page.getByLabel('Hire Ref').fill('H-2231');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const sv = calls.find(([n]) => n === 'site_save_plant_hire');
  check(!!sv && sv[1].p_item === 'Cherry picker 12m' && sv[1].p_supplier === 'GAP Hire' && /^\d{4}-\d{2}-\d{2}$/.test(sv[1].p_on || '') && !('p_rate' in sv[1]), 'on hire: what, who from, the ref and the date — no rate');
  t = await text();
  check(/Cherry picker 12m/.test(t) && /HIRED PLANT · 1 ON HIRE/.test(t), 'listed as on hire');
  await page.getByRole('button', {name: 'Off Hire'}).click(); await page.waitForTimeout(600);
  await page.getByRole('button', {name: 'Off Hire'}).last().click(); await page.waitForTimeout(2000);
  check(!!hires[0].off_hire, 'Off Hire: the date saved');
  await page.screenshot({path: 'shots/pm-hired-plant.png'});

  // ---- Subcontract Orders ----
  await page.goto(`${BASE}/sites/${S1}/materials`); await page.waitForTimeout(4000);
  check(await page.getByText('Subcontract Orders', {exact: true}).count() >= 1, 'Materials: a Subcontract Orders tile');
  await page.getByText('Subcontract Orders', {exact: true}).first().click(); await page.waitForTimeout(3500);
  await page.getByRole('button', {name: '+ New Subcontract Order'}).click(); await page.waitForTimeout(800);
  await page.getByLabel('From Your Subcontractors (Optional)').click(); await page.waitForTimeout(400); await menu('Leadline Ltd').click(); await page.waitForTimeout(400);
  check(await page.getByLabel('Subcontractor', {exact: true}).inputValue() === 'Leadline Ltd' && await page.getByLabel('Email').inputValue() === 'jobs@leadline.example', 'picked from the subcontractors: name and email filled in');
  await page.getByLabel('Scope Of Works').fill('Leadwork to chimneys and valleys');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const ss = calls.find(([n]) => n === 'site_save_subcontract');
  check(!!ss && ss[1].p_name === 'Leadline Ltd' && ss[1].p_worker === 'w1' && ss[1].p_description === 'Leadwork to chimneys and valleys', 'raised: who, the scope, linked to the subcontractor');
  t = await text();
  check(/SC-001 · Leadline Ltd/.test(t) && /Finance To Add The Value/.test(t) && !/£/.test(t), 'listed: number, who, scope; Finance adds the value');
  await page.screenshot({path: 'shots/pm-sub-orders.png'});

  // ---- Material PO's ----
  await page.goto(`${BASE}/sites/${S1}/materials/pos`); await page.waitForTimeout(4500);
  t = await text();
  check(/PURCHASE ORDERS/.test(t) && /J101-PO-001 · SIG Roofing/.test(t) && /J101-PO-002/.test(t) && !/£/.test(t), "Material PO's: the job's POs, no prices");
  await page.getByLabel('PO J101-PO-001').click(); await page.waitForTimeout(500);
  check(/400 × Slate 500x250/.test(await text()), 'a PO opens to its lines');
  await page.getByRole('button', {name: 'Change ▾'}).click(); await page.waitForTimeout(500); await menu('Take Lines Off').click(); await page.waitForTimeout(600);
  await page.getByText('2 × Lead code 4', {exact: true}).last().click(); await page.getByText('Take Them Off', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const am = calls.find(([n]) => n === 'site_po_amend');
  check(!!am && JSON.stringify(am[1].p_drop) === '[1]', `Take Lines Off: the ticked line (${am ? JSON.stringify(am[1].p_drop) : 'none'})`);
  await page.getByLabel('PO J101-PO-002').click(); await page.waitForTimeout(500);
  check(/changed in Finance|Invoiced/.test(await text()) && await page.getByRole('button', {name: 'Change ▾'}).count() <= 1, 'an invoiced PO isn’t changed here');
  await page.getByLabel('PO J101-PO-001').click(); await page.waitForTimeout(500);
  await page.screenshot({path: 'shots/pm-site-pos.png'});
  await page.getByRole('button', {name: 'Change ▾'}).first().click(); await page.waitForTimeout(500); await menu('Cancel The PO').click(); await page.waitForTimeout(500);
  await menu('Cancel The PO').click(); await page.waitForTimeout(2000);
  check(calls.some(([n, b]) => n === 'site_po_cancel' && b.p_po === 'po1'), 'Cancel The PO (after a Yes / No)');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
