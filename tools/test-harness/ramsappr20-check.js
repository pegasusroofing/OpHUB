// Subcontractors' RAMS approval (Andy, 20 Nov 2026: "ensure rams once issued to they go to the pm/site manager for approval,
// they then have a tick to sign or a reject & comment (this enables the pm/site manager to add text and highlight areas in the
// rams"). The database sets a subcontractor's upload to awaiting approval (proved in SQL); here it's seeded so. Their
// operative can't sign it yet; the PM sends it back with a comment and a marked-up page (laptop); their admin sees why, views
// the marked-up copy and uploads a revised version; the PM approves it (the sent-back one is superseded); now it can be
// signed. The PM's HUB names a RAMS waiting. Fake database; nothing is sent. node ramsappr20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const {PDFDocument, StandardFonts} = require('../../app-native/node_modules/pdf-lib');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'ramsappr20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) d.addPage([595, 842]).drawText(`Scaffold RAMS page ${i}: edge protection, loading bays, inspections`, {x: 50, y: 760, size: 12, font: f});
  const rams = Buffer.from(await d.save());
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  const O = me.org_id;
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Acme Scaffolding Ltd', created_at: '2026-11-01T09:00:00Z'}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'o1', is_admin: false}];
  db.rams_docs = [{id: 'sr1', site_id: S1, org_id: O, name: 'Acme Scaffold RAMS', storage_path: `${S1}/sub/scaffold.pdf`, status: 'current', doc_type: 'RAMS', subcontractor_company_id: 'co1', uploaded_by: 'o1', uploaded_at: '2026-11-20T08:00:00Z', approval_status: 'pending'}];
  db.rams_signatures = [];
  db.messages = (db.messages || []).concat([{id: 'mr1', org_id: O, site_id: S1, sender_id: 'o1', audience: 'managers', kind: 'message', related_id: 'sr1', parent_id: null, created_at: new Date().toISOString(), body: 'Acme Scaffolding Ltd uploaded RAMS "Acme Scaffold RAMS" for your approval. Approve it, or send it back with your comments: Main Contractor › Subcontractors › Acme Scaffolding Ltd › RAMS.'}]);
  let markupPdf = null;
  await ctx.route(/supabase\.co\/storage\/v1\/object\//, async (route) => {
    const req = route.request(), u = req.url();
    if (req.method() === 'GET' && /scaffold\.pdf|revised/.test(u)) return route.fulfill({status: 200, contentType: 'application/pdf', body: rams});
    if (req.method() === 'POST' && /rams-review/.test(u)) markupPdf = req.postDataBuffer();
    return route.fallback();
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- The PM: the HUB names it; Send Back with a comment and a marked-up page ----
  await page.goto(`${B}/inbox?tab=todo`); await page.waitForTimeout(6000);
  let t = await text();
  check(/RAMS To Approve/.test(t) && /Acme Scaffolding Ltd uploaded RAMS "Acme Scaffold RAMS" for your approval/.test(t), 'PM’s HUB: "RAMS To Approve — Acme Scaffolding Ltd uploaded RAMS …"');
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/docs?kind=rams`); await page.waitForTimeout(6000);
  t = await text();
  check(/⏳ Awaiting Approval/.test(t) && /✓ Approve/.test(t) && /✕ Send Back/.test(t) && !/Tap To Mark As Issued/.test(t), 'their RAMS: Awaiting Approval, with ✓ Approve and ✕ Send Back');
  await page.screenshot({path: path.join(SHOTS, 'pm-awaiting.png'), fullPage: true});
  await vis('✕ Send Back').first().click(); await page.waitForTimeout(1200);
  t = await text();
  check(/Send Back "Acme Scaffold RAMS"/.test(t) && /Mark Up A Page \(Text \/ Highlight\)/.test(t), 'Send Back: a comment box, and Mark Up A Page on the laptop');
  await page.getByLabel('What needs changing').fill('Add the loading bay edge protection detail on page 2.');
  await vis('✏️ Mark Up A Page (Text / Highlight)').first().click(); await page.waitForTimeout(6000);
  if (await vis('Page 2').count()) { await vis('Page 2').last().click(); await page.waitForTimeout(8000); }
  const area = await page.evaluate(() => { const s = [...document.querySelectorAll('svg, canvas, img')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 300 && b.height > 300).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return s ? {x: s.left, y: s.top, w: s.width, h: s.height} : null; });
  check(!!area, 'page 2 opens in the mark-up tools');
  await page.screenshot({path: path.join(SHOTS, 'pm-markup.png')});
  if (await vis('✎ Pen').count()) await vis('✎ Pen').first().click();
  if (area) { await page.mouse.move(area.x + area.w * 0.3, area.y + area.h * 0.3); await page.mouse.down(); await page.mouse.move(area.x + area.w * 0.6, area.y + area.h * 0.35, {steps: 8}); await page.mouse.up(); }
  await vis('Save').last().click(); await page.waitForTimeout(4000);
  check(/Page 2 marked up/.test(await text()), 'back in Send Back: "Page 2 marked up"');
  await page.getByText('Send Back', {exact: true}).last().click(); await page.waitForTimeout(6000);
  const r1 = db.rams_docs.find((x) => x.id === 'sr1');
  let mpages = 0; try { mpages = markupPdf ? (await PDFDocument.load(markupPdf)).getPageCount() : 0; } catch { mpages = -1; }
  check(r1.approval_status === 'rejected' && /loading bay edge protection/.test(r1.approval_note || '') && /rams-review/.test(r1.approval_markup_path || '') && mpages === 1, `sent back with the comment and a 1-page marked-up PDF (${r1.approval_status}, ${mpages} page)`);
  // In the fake database the uploader isn't recorded by the trigger; set who sent it back as the database does.
  Object.assign(r1, {approval_by: 'me', approval_at: new Date().toISOString()});

  // ---- Their admin: why, the marked-up copy, a revised version ----
  Object.assign(me, {role: 'operative'}); db.subcontractor_operatives.push({id: 'so2', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: true});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/docs?kind=rams`); await page.waitForTimeout(6000);
  t = await text();
  check(/✕ Sent Back/.test(t) && /Add the loading bay edge protection detail on page 2\./.test(t) && /View Marked-Up Copy/.test(t) && /Upload A Revised Version/.test(t) && !/Tap To Sign/.test(t), 'their admin: Sent Back, the comment, View Marked-Up Copy, Upload A Revised Version; nothing to sign');
  await page.screenshot({path: path.join(SHOTS, 'sub-sent-back.png'), fullPage: true});
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), vis('⬆️ Upload A Revised Version').first().click()]);
  await fc.setFiles({name: 'revised scaffold RAMS.pdf', mimeType: 'application/pdf', buffer: rams}); await page.waitForTimeout(5000);
  const r2 = db.rams_docs.find((x) => x.id !== 'sr1' && x.subcontractor_company_id === 'co1');
  check(!!r2 && r2.supersedes === 'sr1', 'the revised version points at the one it replaces');
  Object.assign(r2, {approval_status: 'pending', status: r2.status || 'current', uploaded_at: r2.uploaded_at || new Date().toISOString()}); // as the database sets them
  await page.reload(); await page.waitForTimeout(6000);
  t = await text();
  check(/⏳ Awaiting Approval/.test(t) && !/Add the loading bay edge protection detail/.test(t), 'the sent-back one gives way to the revised one, awaiting approval again');

  // ---- The PM approves; their operative can sign ----
  Object.assign(me, {role: 'admin'}); db.subcontractor_operatives = db.subcontractor_operatives.filter((x) => x.user_id !== 'me');
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/docs?kind=rams`); await page.waitForTimeout(6000);
  await vis('✓ Approve').first().click(); await page.waitForTimeout(800);
  check(/Their operatives can then sign it\./.test(await text()), 'Approve asks Yes / No');
  await vis('Yes').last().click(); await page.waitForTimeout(4000);
  check(r2.approval_status === 'approved' && db.rams_docs.find((x) => x.id === 'sr1').status === 'superseded', 'approved, and the sent-back one is superseded');
  Object.assign(me, {role: 'operative'}); db.subcontractor_operatives.push({id: 'so3', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: false});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/docs?kind=rams`); await page.waitForTimeout(6000);
  check(/Tap To Sign/.test(await text()), 'their operative can now sign it');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
