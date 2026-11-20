// Filling in a report in tabs (Andy, 20 Nov 2026: "change the 7 items into tab style please"). A three-section inspection on
// a phone: one tab per section and Finish; Save & Exit and Next at the bottom; Complete on Finish; a missing answer takes you
// to its tab. Fake database; nothing is sent. node reporttabs20-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.profiles[0].signature_path = 'sig/me.png';
  db.report_submissions = [{id: 'rs3', org_id: db.profiles[0].org_id, site_id: S1, template_id: null, template_name: 'Roof inspection', status: 'in_progress', submitted_by: db.profiles[0].id, submitted_at: new Date().toISOString(),
    sections: [{id: 's1', title: 'Roof', items: [{id: 'q1', type: 'text', label: 'Ridge condition', required: true}]}, {id: 's2', title: 'Access', items: [{id: 'q2', type: 'text', label: 'Scaffold tag checked'}]}, {id: 's3', title: 'Sign Off', items: [{id: 'q3', type: 'text', label: 'Notes'}]}], answers: {}}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/sites/${S1}/snagging/reports/fill/rs3`); await page.waitForTimeout(6000);
  let t = await text();
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((e) => e.innerText.trim()));
  check(['Roof', 'Access', 'Sign Off', 'Finish'].every((x) => tabs.includes(x)), `tabs: ${tabs.join(' | ')}`);
  check(/RIDGE CONDITION/i.test(t) && !/SCAFFOLD TAG CHECKED/i.test(t) && /Save & Exit/.test(t) && /Next: Access ›/.test(t) && !/Complete Inspection/.test(t), 'Roof tab: its question only; Save & Exit and Next: Access › at the bottom');
  await page.screenshot({path: path.join(__dirname, 'shots', 'reporttabs20-roof.png'), fullPage: true});
  await vis('Next: Access ›').first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/SCAFFOLD TAG CHECKED/i.test(t) && !/RIDGE CONDITION/i.test(t) && /Next: Sign Off ›/.test(t), 'Next opens Access');
  await vis('Next: Sign Off ›').first().click(); await page.waitForTimeout(800);
  await vis('Next: Finish ›').first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/Check each tab, then complete the inspection/.test(t) && /Complete Inspection/.test(t), 'Finish: Complete Inspection');
  await vis('Complete Inspection').first().click(); await page.waitForTimeout(1500);
  t = await text();
  check(/"Ridge condition" is required\. \(Roof tab\)/.test(t) && /RIDGE CONDITION/i.test(t), 'a missing answer takes you to its tab, and says which');
  await page.locator('textarea:visible, input:visible').first().fill('Two ridge tiles loose, re-bedded');
  await page.waitForTimeout(800);
  await page.getByRole('tab', {name: 'Finish'}).click(); await page.waitForTimeout(800);
  await vis('Complete Inspection').first().click(); await page.waitForTimeout(9000);
  const s = db.report_submissions[0];
  check(s.status !== 'in_progress' && /Two ridge tiles loose/.test(JSON.stringify(s.answers)), `completed with the answer (${s.status})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
