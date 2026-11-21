// The screens moved into tabs (Andy, 20 Nov 2026: "change the 7 items into tab style please"): the Purchase Order, the report
// template builder and the subcontractor form builder, each with its tabs and Next at the bottom. (Reports, incidents and the
// sign-up forms have their own checks; the Application's Overview / Line By Line is used by the Finance tests.) Laptop.
// Fake database; nothing is sent. node tabs20-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const O = db.profiles[0].org_id;
  db.report_templates = [{id: 'tp1', org_id: O, name: 'Roof inspection', description: '', archived: false, sections: [{id: 's1', title: 'Roof', items: [{id: 'q1', type: 'text', label: 'Ridge'}]}, {id: 's2', title: 'Access', items: []}]}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tabs = () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Purchase Order ----
  await page.goto(`${B}/fin/po/new?site=${S1}`); await page.waitForTimeout(6000);
  let t = await text(), tb = await tabs();
  check(['Details', 'Lines', 'Delivery', 'Raise'].every((x) => tb.some((y) => y.startsWith(x))) && /New Purchase Order/.test(t) && /Next: Lines ›/.test(t) && !/Raise PO/.test(t), `PO: tabs ${tb.join(' | ')}; the heading above them; Next: Lines ›`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'tabs20-po.png')});
  await vis('Next: Lines ›').first().click(); await page.waitForTimeout(800);
  check(/\+ Add Line/.test(await text()), 'PO: Lines tab');
  await vis('Next: Delivery ›').first().click(); await page.waitForTimeout(800);
  check(/Site Contact/.test(await text()), 'PO: Delivery tab');
  await vis('Next: Raise ›').first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/Save Draft/.test(t) && /Raise PO/.test(t) && /Total £/.test(t), 'PO: Raise tab with the total, Save Draft and Raise PO');

  // ---- Report template builder ----
  await page.goto(`${B}/pm/admin/templates/tp1`); await page.waitForTimeout(6000);
  t = await text(); tb = await tabs();
  check(['Details', 'Settings', 'Questions'].every((x) => tb.some((y) => y.startsWith(x))) && /Template Name/.test(t) && /Next: Settings ›/.test(t) && /Save Template/.test(t), `template builder: tabs ${tb.join(' | ')}; Save Template and Next`);
  await vis('Next: Settings ›').first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/Traffic Light System/i.test(t) && /Show Unanswered Questions/i.test(t) && /Next: Questions ›/.test(t), 'template builder: Settings tab');
  await vis('Next: Questions ›').first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/Section Title/.test(t) && /\+ Add Section/.test(t) && !/Next:/.test(t), 'template builder: Questions tab');
  await page.screenshot({path: path.join(__dirname, 'shots', 'tabs20-template.png')});

  // ---- Subcontractor Form builder ----
  await page.goto(`${B}/pm/admin/subapps/form`); await page.waitForTimeout(6000);
  t = await text(); tb = await tabs();
  check(tb.length >= 4 && /^1\. /.test(tb[0]) && /Next: /.test(t) && /Save/.test(t), `form builder: one tab per section (${tb.slice(0, 4).join(' | ')}…), Save and Next`);
  const second = tb[1].replace(/^\d+\.\s*/, '');
  await page.locator('text=/^Next: / >> visible=true').first().click(); await page.waitForTimeout(800);
  check((await tabs()).length === tb.length && (await page.getByLabel('Section 2 title').inputValue().catch(() => '')) === second, `form builder: Next opens section 2 (${second})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'tabs20-subform.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
