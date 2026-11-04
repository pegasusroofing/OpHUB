// AI RAMS writer (4 Nov 2026), on the fake database with a canned AI answer (no real AI call, no cost).
// Admins see "Write With AI" on Create RAMS and in the builder; PMs don't. The draft is added to the RAMS
// after a 'charged per build' Yes / No (nothing already there changes), tagged as AI, and "Save AI Items To Library" puts it in the library.
// node ramsai-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081', S = '/sites/11111111-1111-1111-1111-111111111111';
const out = (n) => path.join(__dirname, 'shots', 'job', `ramsai-${n}.png`);
const DRAFT = {ok: true, model: 'test', data: {
  description: 'Strip and re-felt a flat roof with torch-on felt.', duration: '3 days',
  hazards: [
    {title: 'Hot works – torch-on felt', harm: 'Operatives and occupants: burns, fire spreading into the roof void', p: 4, s: 5, rp: 1, rs: 5, controls: ['Hot works permit issued daily', 'Fire extinguisher within 6m of the torch', 'One-hour fire watch after the last torching']},
    {title: 'Working at height – roof edge', harm: 'Operatives: falls from the roof edge', p: 4, s: 5, rp: 1, rs: 5, controls: ['Scaffold edge protection to all open edges']},
  ],
  sections: [{part: 'method', title: 'Re-felt flat roof (torch-on)', body: '', steps: ['Set up scaffold access and edge protection', 'Strip existing felt', 'Prime the deck', 'Torch on the cap sheet']}],
  ppe: ['hat', 'boots', 'face', 'bogus'], groups: ['Employees', 'Tenants'],
}};
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

async function open(browser, role) {
  const {ctx, db} = await makeContext(browser, role, [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = role; if (role === 'pm') me.name = 'Paula PM';
  let calls = 0;
  await ctx.route(/functions\/v1\/rams-ai-draft/, (r) => { calls++; r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(DRAFT)}); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  return {page, db, errs, ctx, calls: () => calls};
}

(async () => {
  const browser = await chromium.launch();
  {
    const {page, errs, ctx} = await open(browser, 'pm');
    await page.goto(B + S + '/hs/rams/new'); await page.waitForTimeout(3000);
    check(await page.getByText('Or Write It With AI').count() === 0, 'PM: no AI on Create RAMS');
    await page.goto(B + S + '/hs/rams/build/b1'); await page.waitForTimeout(3500);
    check(await page.getByText('Write With AI').count() === 0, 'PM: no AI in the builder');
    check(!errs.length, `PM: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  {
    const {page, db, errs, ctx, calls} = await open(browser, 'admin');
    await page.goto(B + S + '/hs/rams/new'); await page.waitForTimeout(3000);
    await page.getByText('Or Write It With AI').click(); await page.waitForTimeout(300);
    await page.fill('textarea[aria-label="Describe the work for the AI"]', 'Strip and re-felt a 40m2 flat roof with torch-on felt, scaffold access.');
    await page.screenshot({path: out('create')});
    // The charge question first: No means no AI call and no RAMS.
    await page.getByText('Create RAMS', {exact: true}).last().click(); await page.waitForTimeout(800);
    check(await page.getByText(/charged per build/).count() > 0, 'admin: charged-per-build question shown');
    await page.screenshot({path: out('charge')});
    await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(800);
    check(calls() === 0 && page.url().includes('/rams/new'), 'admin: No = no AI call');
    await page.getByText('Create RAMS', {exact: true}).last().click(); await page.waitForTimeout(800);
    await page.getByText('Yes, Write It', {exact: true}).click(); await page.waitForTimeout(5000);
    check(calls() === 1, 'admin: Create RAMS called the AI once');
    const made = (db.rams_builds || []).slice(-1)[0];
    check(!!made && made.hazards.some((h) => h.title === 'Hot works – torch-on felt' && h.ai), 'admin: AI hazards saved on the new RAMS');
    check(!!made && !made.ppe.includes('bogus') && made.ppe.includes('face'), 'admin: only known PPE kept');
    check(/\/hs\/rams\/build\//.test(page.url()), 'admin: opens the builder');
    await page.waitForTimeout(1500);
    check(await page.getByText(/written by AI/).count() > 0, 'admin: AI banner shown');
    await page.screenshot({path: out('builder-ra')});
    // Adding again from the builder doesn't double anything up.
    const before = made.hazards.length;
    await page.getByText('✨ Write With AI', {exact: true}).click(); await page.waitForTimeout(400);
    await page.locator('textarea[aria-label="Describe the work for the AI"]').last().fill('Same again');
    await page.screenshot({path: out('popup')});
    await page.getByText('Write It', {exact: true}).click(); await page.waitForTimeout(800);
    await page.getByText('Yes, Write It', {exact: true}).click(); await page.waitForTimeout(2500);
    check(calls() === 2, 'admin: builder asked, then called the AI');
    const again = (db.rams_builds || []).find((x) => x.id === made.id);
    check(again.hazards.length === before, `admin: writing again adds no duplicates (${again.hazards.length})`);
    const lib0 = (db.rams_library_items || []).length;
    await page.getByText('⭳ Save AI Items To Library').click(); await page.waitForTimeout(2500);
    const lib1 = (db.rams_library_items || []).length;
    check(lib1 > lib0, `admin: AI items saved to the library (${lib1 - lib0})`);
    await page.screenshot({path: out('saved')});
    check(!errs.length, `admin: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
})();
