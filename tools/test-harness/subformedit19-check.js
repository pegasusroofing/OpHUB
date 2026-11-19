// Editing the subcontractor sign-up form (Andy, 19 Nov 2026: "the sub contractor sign up form in settings, needs an edit
// button added as i need to edit the template"). Admin › Subcontractor Sign-Up › Edit The Form: add a required Yes / No
// question, remove one, rename a section, Save; the 🔒 core questions can't be removed. The public sign-up page and the
// in-app form then show the company's form, a new required question must be answered, and the office sees its answer
// labelled. Fake database; the sign-up server function caught. node subformedit19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); const me = db.profiles[0]; Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id;
  db.subform_templates = []; db.subcontractor_applications = db.subcontractor_applications || [];
  global.__rpc = (n, b) => { if (n === 'get_subform_template') { const t = db.subform_templates.find((x) => x.org_id === b.p_org); return t ? t.sections : null; } return undefined; };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = () => page.evaluate(() => document.body.innerText);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(`${B}/pm/admin/subapps`); await page.waitForTimeout(4500);
  check(/✎ Edit The Form/.test(await text()), 'the sign-up settings have Edit The Form');
  await page.getByText('✎ Edit The Form', {exact: true}).click(); await page.waitForTimeout(4000);
  let t = await text();
  check(/Subcontractor Sign-Up Form/.test(t) && /🔒 Company Name/.test(t) && /The standard form/.test(t), 'the editor opens on the standard form, core questions locked');
  const coreBin = await page.getByLabel('Remove question').count();
  const allQs = (await page.evaluate(() => [...document.querySelectorAll('[aria-label="Edit question"]')].length));
  check(coreBin === allQs - 4, `the four 🔒 questions have no remove button (${allQs} questions, ${coreBin} removable)`);
  // Remove "Website" (section 1).
  await page.getByText('Website', {exact: true}).first().click(); await page.waitForTimeout(400);
  const qRow = page.getByText('Website', {exact: true}).first().locator('xpath=ancestor::div[3]');
  await qRow.getByLabel('Remove question').first().click(); await page.waitForTimeout(400);
  await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(500);
  check(!/^Website$/m.test(await text()), 'Website is removed');
  // Add a required Yes / No question to section 1.
  await page.getByText('+ Add Question', {exact: true}).first().click(); await page.waitForTimeout(600);
  await page.locator('input[value="New Question"]').first().fill('Do You Use Scaffold Towers?');
  await page.getByText('Short Answer ▾', {exact: true}).last().click(); await page.waitForTimeout(500);
  await page.getByText('Yes / No', {exact: true}).last().click(); await page.waitForTimeout(500);
  await page.getByLabel('Required: Yes', {exact: true}).last().click();
  await page.waitForTimeout(300);
  await page.getByText('Done', {exact: true}).last().click(); await page.waitForTimeout(300);
  // Rename section 3.
  await page.getByLabel('Section 3 title').fill('Your Work And Trades');
  await page.screenshot({path: path.join(__dirname, 'shots', 'subformedit19-editor.png'), fullPage: true});
  await page.getByText('Save', {exact: true}).click(); await page.waitForTimeout(2500);
  const saved = (db.subform_templates[0] || {}).sections || [];
  const flat = saved.flatMap((s) => s.q);
  const towers = flat.find((q) => q.l === 'Do You Use Scaffold Towers?');
  check(!!towers && towers.type === 'yesno' && towers.req === 1 && !flat.some((q) => q.k === 'website_url') && saved[2] && saved[2].t === 'Your Work And Trades', `Save keeps the company's form (new Yes / No ${towers ? (towers.req ? 'required' : 'not required') : 'missing'}, Website gone, section 3 renamed)`);
  check(/Saved - your sign-up form now uses this/.test(await text()), 'it says it is saved');

  // The public sign-up page shows the company's form.
  const sent = [];
  await ctx.route(/functions\/v1\/subcontractor-apply/, (r) => { const b = JSON.parse(r.request().postData() || '{}'); if (b.action === 'submit') sent.push(b); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(b.action === 'org' ? {name: 'RTB Roofing', colour: '#E3262B'} : {ok: true})}); });
  const pub = await ctx.newPage(); pub.on('pageerror', (e) => errs.push(e.message));
  await pub.goto(`${B}/subcontractor?org=${O}`); await pub.waitForTimeout(6000);
  t = await pub.evaluate(() => document.body.innerText);
  check(/Do You Use Scaffold Towers\?/.test(t) && /3\. Your Work And Trades/.test(t) && !/\bWebsite\b/.test(t), 'the public sign-up page shows the company’s form');
  await pub.screenshot({path: path.join(__dirname, 'shots', 'subformedit19-public.png'), fullPage: true});
  // The in-app form for an operative.
  await page.goto(`${B}/subform`); await page.waitForTimeout(5000);
  t = await text();
  check(/Do You Use Scaffold Towers\?/.test(t) && /Your Work And Trades/.test(t), 'the in-app form shows the company’s form too');
  // The office sees the new answer labelled.
  db.subcontractor_applications.push({id: 'sa1', org_id: O, status: 'new', company_name: 'Acme Ltd', contact_name: 'Sam', email: 's@acme.example', data: {[towers ? towers.k : 'x']: 'Yes', trades: ['Leadwork']}, files: [], created_at: new Date().toISOString()});
  await page.goto(`${B}/pm/admin/subapps/sa1`); await page.waitForTimeout(4500);
  t = await text();
  check(/Do You Use Scaffold Towers\?\s*Yes/.test(t), 'the application shows the new question’s answer, labelled');
  // Back to the standard form.
  await page.goto(`${B}/pm/admin/subapps/form`); await page.waitForTimeout(4000);
  await page.getByText('Back To The Standard Form', {exact: true}).click(); await page.waitForTimeout(500);
  await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(!db.subform_templates.length && /The standard form/.test(await text()), 'Back To The Standard Form removes the company’s copy');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
