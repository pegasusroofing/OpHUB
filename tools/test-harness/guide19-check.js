// The set-up guide on Home (Andy, 19 Nov 2026: "the reports and templates on the set up guide, i have done but its not
// clearing or marking as done"): Set Up Report And Email Templates, Fill The H&S Libraries and Set Up Finance now tick
// themselves when there's a report or email template, a RAMS library item or toolbox talk, and the company's details in
// Finance. Fake database, laptop size. node guide19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const STEPS = ['Set Up Report And Email Templates', 'Fill The H&S Libraries', 'Set Up Finance'];

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = [];
  const O = db.organizations[0].id; db.organizations[0].has_finance = true;
  db.report_templates = []; db.fin_email_templates = []; db.rams_library_items = []; db.tbt_templates = []; db.fin_settings = []; db.suppliers = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const struck = () => page.evaluate((steps) => Object.fromEntries(steps.map((s) => {
    const el = [...document.querySelectorAll('div, span')].find((e) => e.children.length === 0 && e.textContent.trim() === s);
    return [s, el ? getComputedStyle(el).textDecorationLine.includes('line-through') : null];
  })), STEPS);
  let st = await struck();
  check(STEPS.every((s) => st[s] === false), `before: the three steps are not done (${JSON.stringify(st)})`);
  db.report_templates.push({id: 'rt1', org_id: O, name: 'Roof Inspection', created_at: new Date().toISOString()});
  db.rams_library_items.push({id: 'rl1', org_id: O, kind: 'hazard', title: 'Working at height', data: {}, sort_order: 1});
  db.fin_settings.push({org_id: O, company_reg_no: '17051302'});

  await page.reload(); await page.waitForTimeout(6000);
  st = await struck();
  check(STEPS.every((s) => st[s] === true), `after: a report template, a RAMS library item and Finance details tick them (${JSON.stringify(st)})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'guide19.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
