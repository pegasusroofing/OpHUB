// Finance › Sales › + New Application (Andy, 17 Nov 2026, option A): no big pop-up list of jobs; a New Application page
// with a Project box at the top, the matching jobs dropping just under it as you type (jobs billed by invoice aren't
// offered); pick one and its application opens. A job with no Bill of Quantities starts with one line, Contract Works,
// at the contract value ("relaxed for afp's"), and nothing goes to the operatives' schedule ("doesn't auto issue to
// the operatives screens"). A job with neither a BoQ nor a contract value still goes to its BoQ. Phone and laptop.
// Fake database. node newapp17-check.js
const {chromium, makeContext, S1, S2, S3} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'newapp17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const O = db.organizations[0].id;
  // Studley Rd: by application, a contract value, no BoQ. Cleveland: billed by invoice. Simon De Senlis: by application,
  // no BoQ and no contract value.
  db.job_finance = [
    {site_id: S1, org_id: O, billing_type: 'application', contract_value: 48000},
    {site_id: S2, org_id: O, billing_type: 'invoice', contract_value: 126500},
    {site_id: S3, org_id: O, billing_type: 'application', contract_value: null},
  ];
  db.fin_contract_items = []; db.fin_applications = [];
  const tasksBefore = (db.schedule_tasks || []).length;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const body = () => page.evaluate(() => document.body.innerText);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // ---- Phone ----
  await page.goto(B + '/fin/sales?tab=apps'); await page.waitForTimeout(5000);
  await page.getByText('+ New Application', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/fin/newapp', `+ New Application opens the New Application page, not a pop-up list (${new URL(page.url()).pathname})`);
  let t = await body();
  check(/Finance\s*›\s*Sales\s*›\s*New Application/.test(t), 'the trail: Finance › Sales › New Application');
  check(/Project/.test(t) && /J101 · Studley Rd/.test(t) && !/J102 · Cleveland/.test(t), 'the Project box lists the jobs under it; a job billed by invoice isn\'t offered');
  await page.screenshot({path: path.join(SHOTS, 'project-box-phone.png')});
  await vis('input[aria-label="Project"]').fill('stud'); await page.waitForTimeout(600);
  t = await body();
  check(/J101 · Studley Rd/.test(t) && !/Simon De Senlis/.test(t), 'typing narrows it to the matching job');
  await page.screenshot({path: path.join(SHOTS, 'typed-phone.png')});
  await page.getByText('J101 · Studley Rd', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(6000);
  const p = new URL(page.url()).pathname;
  check(new RegExp(`^/fin/job/${S1}/application/[^/]+$`).test(p) && !p.endsWith('/new'), `picking it opens its application (${p})`);
  const items = db.fin_contract_items.filter((i) => i.site_id === S1);
  check(items.length === 1 && items[0].description === 'Contract Works' && Number(items[0].value) === 48000, `no BoQ: it starts with one line, Contract Works, at the contract value (${JSON.stringify(items.map((i) => [i.description, i.value]))})`);
  check(db.fin_applications.length === 1 && (db.fin_applications[0].lines || []).some((l) => l.item_id === items[0]?.id), 'the application has the Contract Works line');
  check((db.schedule_tasks || []).length === tasksBefore && !(db.schedule_tasks || []).some((x) => x.contract_item_id === items[0]?.id), 'nothing added to the operatives\' schedule');
  t = await body();
  check(/Contract Works/.test(t), 'the application shows the Contract Works line');
  await page.screenshot({path: path.join(SHOTS, 'application-phone.png')});

  // A job with no BoQ and no contract value: to its BoQ, as before.
  await page.goto(B + '/fin/newapp'); await page.waitForTimeout(4000);
  await vis('input[aria-label="Project"]').fill('senlis'); await page.waitForTimeout(600);
  await page.getByText('J103 · Simon De Senlis', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(6000);
  check(new URL(page.url()).pathname === `/fin/job/${S3}/boq` && !db.fin_contract_items.some((i) => i.site_id === S3), `no BoQ and no contract value: it goes to the job's BoQ (${new URL(page.url()).pathname})`);

  // ---- Laptop ----
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/fin/sales?tab=apps'); await page.waitForTimeout(5000);
  await page.getByText('+ New Application', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/fin/newapp' && /J101 · Studley Rd/.test(await body()), 'laptop: the same page with the Project box');
  await page.screenshot({path: path.join(SHOTS, 'project-box-laptop.png'), clip: {x: 0, y: 0, width: 1300, height: 560}});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
