// The site induction takes in the site rules and layout, signed as one (Andy, 20 Nov 2026: "the inductions should attach a
// copy of the site rules so its signed as one, the cpp doesnt need signing"). An operative on a phone: the rules are on the
// induction's first page with View and a tick; it won't go on without the tick; signing the induction signs the rules; the
// induction PDF has the rules in the back (2 pages). Fake database; nothing is sent. node indrules20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const {PDFDocument} = require('../../app-native/node_modules/pdf-lib');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
(async () => {
  const two = await PDFDocument.create(); two.addPage([595, 842]); two.addPage([595, 842]); const rulesPdf = Buffer.from(await two.save());
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.site_layout_docs = [{id: 'lr1', site_id: S1, name: 'Site Rules and Layout Plan.pdf', storage_path: `${S1}/layout/rules.pdf`, uploaded_at: '2026-11-01T09:00:00Z'}];
  db.site_layout_signatures = []; db.site_induction_completions = []; db.subcontractor_operatives = [];
  let pdf = null;
  await ctx.route(/supabase\.co\/storage\/v1\/object\//, async (route) => {
    const req = route.request(), u = req.url();
    if (req.method() === 'GET' && /layout\/rules\.pdf/.test(u)) return route.fulfill({status: 200, contentType: 'application/pdf', body: rulesPdf});
    if (req.method() === 'POST' && /site-inductions/.test(u)) pdf = req.postDataBuffer();
    return route.fallback();
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/sites/${S1}/mc/inductions`); await page.waitForTimeout(5000);
  // The company's own induction form since 20 Nov 2026: a tab per section, then Sign (the rules are on the Sign tab).
  const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(600); };
  const n = await page.locator('text="☐" >> visible=true').count();
  for (let i = 0; i < n; i++) { await page.locator('text="☐" >> visible=true').first().click(); await page.waitForTimeout(150); }
  await tab(/^Next Of Kin/);
  await page.getByLabel('Name', {exact: true}).fill('Sue Fitter'); await page.getByLabel('Phone Number', {exact: true}).fill('07700 900999');
  await tab(/^Health/);
  const nos = page.getByRole('button', {name: /: No$/}); const k = await nos.count();
  for (let i = 0; i < k; i++) { await nos.nth(i).click(); await page.waitForTimeout(80); }
  await tab(/^Sign/);
  let t = await text();
  check(/Site Rules & Layout/i.test(t) && /Site Rules and Layout Plan\.pdf/.test(t) && /Signing this induction signs these too/.test(t) && /I have read and understood the site rules and layout/.test(t), 'the Sign tab: the site rules with View, and a tick to say they’re read');
  await page.getByRole('button', {name: 'Sign and complete induction'}).click(); await page.waitForTimeout(1200);
  check(/Read the site rules and layout, then tick/.test(await text()), 'it won’t sign until the rules are ticked as read');
  await page.getByText('I have read and understood the site rules and layout').click(); await page.waitForTimeout(300);
  await page.screenshot({path: path.join(__dirname, 'shots', 'indrules20-page1.png'), fullPage: true});
  await page.getByRole('button', {name: 'Sign and complete induction'}).click(); await page.waitForTimeout(9000);
  check(db.site_induction_completions.length === 1, 'the induction is saved');
  check(db.site_layout_signatures.some((x) => x.layout_id === 'lr1' && x.user_id === 'me' && x.signature_image_path === 'sig/me.png'), 'and the site rules are signed with the same signature');
  let pages = 0; try { pages = pdf ? (await PDFDocument.load(pdf)).getPageCount() : 0; } catch { pages = -1; }
  check(pages >= 4, `the induction PDF has the rules in the back (${pages} pages: the induction, a rules page, and the 2-page rules)`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
