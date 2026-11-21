// Andy, 21 Nov 2026 (the Induction Form on his phone): "at the end of the induction admin bit there is no save so doesn't
// look right". The last tab of the Induction Form, Site Rules Template and CPP Template has a Save; long questions and
// rules aren't cut off. Fake database, phone width. node indsave21-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'indsave21'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  db.induction_templates = []; db.site_rules_builds = []; db.cpp_defaults = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(800); };
  // Is any box cutting its text off?
  const clipped = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent && e.scrollHeight > e.clientHeight + 3).map((e) => (e.getAttribute('aria-label') || '') + ': ' + e.value.slice(0, 30)), sel);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto(`${B}/pm/admin/inductionform`); await page.waitForTimeout(5000);
  await tab(/^Health/);
  let t = await text();
  check(/Save Form/.test(t) && /\+ Add Section/.test(t) && /Back To Standard Form/.test(t), 'Induction Form: the last tab ends with Save Form, + Add Section, Back To Standard Form');
  let cut = await clipped('textarea[aria-label^="Question"]');
  check(!cut.length, `Induction Form: no question is cut off (${cut.join(' | ') || 'none'})`);
  const row = await page.evaluate(() => { const r = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && d.textContent === 'Required?'); const seg = r && r.nextElementSibling; const a = r && r.getBoundingClientRect(), b = seg && seg.getBoundingClientRect(); return a && b ? Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom - 0) / 2) : 99; });
  check(row < 9, `Induction Form: Required? lines up with its Yes / No (${Math.round(row)}px off)`);
  await page.getByText('Save Form', {exact: true}).click(); await page.waitForTimeout(2500);
  check(db.induction_templates.length === 1 && /Saved ✓/.test(await text()), 'Induction Form: Save Form saves and says Saved ✓');
  await page.screenshot({path: path.join(SHOTS, 'induction-form-end-phone.png'), fullPage: true});

  await page.goto(`${B}/pm/admin/siterules`); await page.waitForTimeout(5000);
  await tab(/^Rules/);
  await page.getByLabel('Rule 1', {exact: true}).fill('Hard hats, safety boots and hi-vis must be worn at all times within the site boundary, including the compound and welfare areas, unless the site manager says otherwise.'); await page.waitForTimeout(1500);
  cut = await clipped('textarea[aria-label^="Rule"]');
  check(!cut.length, `Site Rules Template: no rule is cut off (${cut.join(' | ') || 'none'})`);
  check(/Save Template/.test(await text()), 'Site Rules Template: the Rules tab ends with Save Template');
  await page.getByText('Save Template', {exact: true}).click(); await page.waitForTimeout(2500);
  check(db.site_rules_builds.some((x) => !x.site_id) && /Saved ✓/.test(await text()), 'Site Rules Template: Save Template saves and says Saved ✓');
  await page.screenshot({path: path.join(SHOTS, 'siterules-template-end-phone.png'), fullPage: true});

  await page.goto(`${B}/pm/admin/cpptemplate`); await page.waitForTimeout(5000);
  const tabs = await page.getByRole('tab').allInnerTexts();
  await page.getByRole('tab').last().click(); await page.waitForTimeout(800);
  check(/Save Template/.test(await text()), `CPP Template: the last tab (${(tabs[tabs.length - 1] || '').trim()}) ends with Save Template`);
  await page.getByText('Save Template', {exact: true}).click(); await page.waitForTimeout(2500);
  check(db.cpp_defaults.length === 1 && /Saved ✓/.test(await text()), 'CPP Template: Save Template saves and says Saved ✓');
  await ctx.close();
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
