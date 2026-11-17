// Role switches, stage 2 (Andy, 17 Nov 2026: "Yes, build stage 2"). A PM whose role lacks Sign Off H&S sees H&S
// read-only; one without Finance – Edit sees Finance look-only and without Raise Orders can't raise orders; a Finance
// Controller whose role has Projects parts gets the Projects side; the board says what Site Managers can't do.
// The database side (Every Job, Manage People, the H&S lock, notify_off) is proven in SQL
// (docs/claude-code/sql/role-switches-stage2-17nov.sql).
// node roles17b-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'roles17b');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const ALL = ['every_job', 'create_projects', 'prices', 'fin_view', 'fin_edit', 'quotes', 'sow', 'snags', 'hs_signoff', 'orders', 'docs', 'team', 'people', 'reports', 'notify'];
const without = (...xs) => ALL.filter((k) => !xs.includes(k));

async function as(browser, role, perms, extra) {
  const c = await makeContext(browser, role, [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(c.db);
  Object.assign(c.db.profiles.find((p) => p.id === 'me'), {role, howto_dismissed: ['*'], ...(extra || {})});
  global.__rpc = (name) => (name === 'my_role_perms' ? perms : undefined);
  const page = await c.ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(B + '/home'); await page.waitForTimeout(3000); // let the sign-in's own redirect finish first
  return {page, db: c.db, errs, text: () => page.evaluate(() => document.body.innerText)};
}

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];

  // 1. A PM without Sign Off H&S.
  let u = await as(browser, 'pm', without('hs_signoff'));
  await u.page.goto(B + `/sites/${S1}/hs/rams`); await u.page.waitForTimeout(4000);
  let t = await u.text();
  check(/RAMS/i.test(t) && !/Create \/ Upload|Upload A Document|\+ Upload/i.test(t), 'H&S › RAMS opens, with no Create / Upload');
  await u.page.screenshot({path: path.join(SHOTS, 'rams-readonly.png')});
  await u.page.goto(B + `/sites/${S1}/hs/rams/new`); await u.page.waitForTimeout(3000);
  check(/Your role can view H&S but not sign it off/.test(await u.text()), 'the RAMS builder says why');
  await u.page.goto(B + `/sites/${S1}/hs/tbt`); await u.page.waitForTimeout(3500);
  await u.page.getByText('TBT Library', {exact: true}).first().click(); await u.page.waitForTimeout(800);
  check(/TBT Library/i.test(await u.text()), 'Toolbox talks open (TBT Library)');
  check(!/Write A Toolbox Talk|Upload A Toolbox Talk/i.test(await u.text()), 'Toolbox talks: no Write or Upload');
  errs.push(...u.errs); await u.page.context().close();

  // 2. The same PM with Sign Off H&S still has the tools.
  u = await as(browser, 'pm', ALL);
  await u.page.goto(B + `/sites/${S1}/hs/tbt`); await u.page.waitForTimeout(3500);
  await u.page.getByText('TBT Library', {exact: true}).first().click(); await u.page.waitForTimeout(800);
  check(/Write A Toolbox Talk|Upload A Toolbox Talk/i.test(await u.text()), 'with Sign Off H&S: Write / Upload A Toolbox Talk are there');
  errs.push(...u.errs); await u.page.context().close();

  // 3. A Finance Controller whose role has Projects parts gets the Projects side.
  u = await as(browser, 'pm', ['every_job', 'prices', 'fin_view', 'fin_edit', 'docs', 'team', 'reports'], {finance_only: true, finance_enabled: true});
  await u.page.goto(B + '/sites'); await u.page.waitForTimeout(4000);
  t = await u.text();
  check(!/\/fin/.test(u.page.url()) && /Live|Projects/i.test(t), `a Finance Controller with Projects parts stays in Projects (${u.page.url().replace(B, '')})`);
  errs.push(...u.errs); await u.page.context().close();
  // ...and one without any stays in Finance, as before.
  u = await as(browser, 'pm', ['prices', 'fin_view', 'fin_edit', 'reports'], {finance_only: true, finance_enabled: true});
  await u.page.goto(B + '/sites'); await u.page.waitForTimeout(4000);
  check(/\/fin/.test(u.page.url()), `a Finance Controller with Finance only is sent to Finance (${u.page.url().replace(B, '')})`);
  errs.push(...u.errs); await u.page.context().close();

  // 4. Finance – View without Edit, and no Raise Orders: Finance look-only; no ordering in Materials.
  u = await as(browser, 'pm', without('fin_edit', 'orders'), {finance_enabled: true});
  await u.page.goto(B + '/fin/purchases?tab=orders'); await u.page.waitForTimeout(5000);
  t = await u.text();
  check(/View Only/.test(t) && !t.includes('+ New PO'), 'Finance › Purchases: View Only, no + New PO');
  await u.page.screenshot({path: path.join(SHOTS, 'fin-view-only.png')});
  await u.page.goto(B + '/fin/sales'); await u.page.waitForTimeout(4000);
  t = await u.text();
  check(/View Only/.test(t) && !t.includes('+ New Invoice') && !t.includes('+ New Application'), 'Finance › Sales: no + New Invoice / Application');
  await u.page.goto(B + `/sites/${S1}/materials/requests`); await u.page.waitForTimeout(4000);
  t = await u.text();
  check(!/Order from Merchant|Send Order/i.test(t), 'Materials: no ordering');
  errs.push(...u.errs); await u.page.context().close();
  // ...and with everything, Finance is as before.
  u = await as(browser, 'pm', ALL, {finance_enabled: true});
  await u.page.goto(B + '/fin/purchases?tab=orders'); await u.page.waitForTimeout(5000);
  t = await u.text();
  check(!/View Only/.test(t) && t.includes('+ New PO'), 'with Finance – Edit and Raise Orders: + New PO is there, no View Only');
  errs.push(...u.errs); await u.page.context().close();

  // 5. The board says what Site Managers can't do.
  u = await as(browser, 'admin', null);
  await u.page.goto(B + '/pm/admin/roles'); await u.page.waitForTimeout(4000);
  await u.page.getByLabel('Role', {exact: true}).click(); await u.page.waitForTimeout(600);
  await u.page.getByText('Site Manager', {exact: true}).last().click(); await u.page.waitForTimeout(800);
  check(/Site Managers only see the jobs they.re put on and can.t make projects/.test(await u.text()), 'the board explains Site Managers’ limits');
  errs.push(...u.errs); await u.page.context().close();

  global.__rpc = undefined;
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
