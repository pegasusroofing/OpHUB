// A PM does it all in Projects (Andy, 8 Nov 2026: "Finance is purely the monetary element"). On the fake database, laptop:
// Variations — an approved variation is taken through the client (Issued To Client, then Client Approved with who
// instructed it and their reference) and its instruction document attached, with counts across the top; Day Works — a new
// tile and page: record one (date, title, labour), issue it to the client, the tiles count it; Handover — Practical
// Completion and the defects period set here (set_site_completion). The database triggers that fill Finance's registers were
// checked on Sandbox (rolled back). node pm-projects-check.js
const path = require('path');
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  db.variations = [
    {id: 'v1', site_id: S1, description: 'Extra lead flashing to chimney', photo_path: `${S1}/variations/a.jpg`, cost_impact: '850.00', status: 'live', approval_status: 'approved', client_status: 'to_issue', docs: [], created_by: 'me', created_at: '2026-11-03T09:00:00Z'},
    {id: 'v2', site_id: S1, description: 'Replace rotten fascia', photo_path: `${S1}/variations/b.jpg`, status: 'live', approval_status: 'pending', client_status: 'to_issue', docs: [], created_by: 'me', created_at: '2026-11-04T09:00:00Z'},
  ];
  db.site_dayworks = [];
  const rpcs = [];
  global.__rpc = (name, b) => { if (name === 'set_site_completion') { rpcs.push(b); return true; } if (name === 'site_completion') return rpcs.length ? [{pc_date: rpcs[rpcs.length - 1].p_pc_date, defects_months: rpcs[rpcs.length - 1].p_defects_months}] : []; return undefined; };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Variations: the client stage ----
  await page.goto(`${BASE}/sites/${S1}/snagging/variations`); await page.waitForTimeout(5000);
  let t = await text();
  check(/To Issue 1/.test(t) && await page.getByText('Day Works', {exact: true}).count() >= 1, 'Variations: counts by client stage, and a Day Works button');
  await page.getByText('Extra lead flashing to chimney').first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/Client/.test(t) && /Goes on an application once the client approves it/.test(t), 'an approved variation shows its client stage');
  await page.getByText('Client ▾', {exact: true}).click(); await page.waitForTimeout(500);
  await menu('Issued To Client').click(); await page.waitForTimeout(1500);
  check(db.variations[0].client_status === 'issued' && !!db.variations[0].client_at, 'Client ▾ › Issued To Client: saved with the date');
  await page.getByText('Client ▾', {exact: true}).click(); await page.waitForTimeout(500);
  await menu('Client Approved…').click(); await page.waitForTimeout(800);
  await page.getByLabel('Instructed By').fill('Site Agent (Bellway)'); await page.getByLabel('Instruction Ref').fill('AI-07');
  await page.getByText('Client Approved', {exact: true}).last().click(); await page.waitForTimeout(1500);
  const v1 = db.variations[0];
  check(v1.client_status === 'approved' && v1.instructed_by === 'Site Agent (Bellway)' && v1.instruction_ref === 'AI-07' && !!v1.instructed_on, 'Client Approved: who instructed it, their reference and the date');
  t = await text();
  check(/Instructed By Site Agent \(Bellway\)/.test(t) && /Ref AI-07/.test(t) && /Goes on the next application for payment/.test(t), 'shown on the variation: the instruction, and that it goes on the next application');
  const fc = page.waitForEvent('filechooser'); await page.getByText('📎 Add Document', {exact: true}).click(); await (await fc).setFiles([path.join(__dirname, 'shots', 'samples', 'sample.pdf')]); await page.waitForTimeout(2500);
  check((db.variations[0].docs || []).length === 1 && /sample\.pdf/.test(await text()), 'the instruction document is attached to the variation');
  await page.screenshot({path: 'shots/pm-variation-client.png'});

  // ---- Day Works ----
  await page.goto(`${BASE}/sites/${S1}/snagging`); await page.waitForTimeout(4000);
  check(await page.getByText('Day Works', {exact: true}).count() >= 1, 'a Day Works tile beside Snagging and Variations');
  await page.getByText('Day Works', {exact: true}).first().click(); await page.waitForTimeout(3000);
  await page.getByText('+ New Day Work', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByLabel('Title (e.g. Clear Gutters After Storm)').fill('Clear gutters after storm');
  await page.getByLabel('Day Work Sheet No.').fill('DWS 12');
  await page.getByLabel('Labour (e.g. 2 Men, 1 Day)').fill('2 men, 1 day'); await page.getByLabel('Plant').fill('Cherry picker');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const dw = (db.site_dayworks || [])[0];
  check(!!dw && dw.title === 'Clear gutters after storm' && dw.ref === 'DWS 12' && dw.labour === '2 men, 1 day' && dw.site_id === S1 && dw.org_id === O && !!dw.work_date, 'New Day Work: saved with the date, sheet number, labour and plant');
  if (dw && !dw.client_status) dw.client_status = 'to_issue';
  await page.goto(`${BASE}/sites/${S1}/snagging/dayworks`); await page.waitForTimeout(3000);
  await page.getByText('Clear gutters after storm').first().click(); await page.waitForTimeout(600);
  await page.getByText('Client ▾', {exact: true}).click(); await page.waitForTimeout(500);
  await menu('Issued To Client').click(); await page.waitForTimeout(1500);
  check(db.site_dayworks[0].client_status === 'issued', 'Client ▾ › Issued To Client');
  check(await page.getByLabel('Issued To Client, 1').count() === 1, 'the tiles count it under Issued To Client');
  await page.screenshot({path: 'shots/pm-dayworks.png'});

  // ---- Handover: practical completion ----
  await page.goto(`${BASE}/sites/${S1}/handover`); await page.waitForTimeout(4000);
  check(/Practical Completion/.test(await text()) && /Not Set Yet/.test(await text()), 'Handover: Practical Completion, not set yet');
  await page.getByText('Set', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.getByLabel('Practical Completion Date').click(); await page.waitForTimeout(600);
  await page.locator('text="14" >> visible=true').last().click(); await page.waitForTimeout(400);
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(rpcs.length === 1 && rpcs[0].p_site === S1 && /^\d{4}-\d{2}-14$/.test(rpcs[0].p_pc_date || '') && rpcs[0].p_defects_months === 12, `saved through set_site_completion (${JSON.stringify(rpcs[0] || {})})`);
  check(/Defects Period 12 Months/.test(await text()), 'shows the date and the 12-month defects period');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
