// The settings cross-checked against Roles (Andy, 18 Nov 2026: "there is a who sees finance but we have recently set the
// roles up"; "Yes, all four"). 1. Money On Home is a role part (the Home Page setting is gone from the Admin Centre); a
// role not set yet keeps the old answer. 2. Users: someone whose role has no Finance – View shows "Role Has No Finance",
// not a switch that does nothing. 3. See Material Costs is a role part; operatives one by one on Admin › People ›
// Material Costs For Operatives, since removed ("Yes, remove it": nobody had it on); Finance › Settings points to Roles. 4. Expenses: one page with where receipts go and who
// books them in Finance. Laptop, then a PM's Home on a phone. Fake database. node roles18-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'roles18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const PM = ['every_job', 'create_projects', 'prices', 'fin_view', 'quotes', 'sow', 'snags', 'hs_signoff', 'orders', 'docs', 'team', 'people', 'reports', 'notify'];
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const seedRoles = (db, org) => {
  const R = (id, name, access, d, pos, perms, extra) => ({id, org_id: org, name, access, is_default: d, position: pos, perms, perms_extra: extra});
  db.org_roles = [
    R('r1', 'Admin', 'admin', true, 1, null, null), R('r4', 'Project Manager', 'pm', true, 2, PM.slice(), null),
    R('r5', 'Document Controller', 'pm', false, 3, ['every_job', 'docs'], null), R('r7', 'Site Manager', 'site_manager', true, 4, PM.filter((k) => k !== 'prices'), null),
    R('r8', 'Operative', 'operative', true, 5, null, null), R('r9', 'Delivery Driver', 'driver', true, 6, null, null),
  ];
};

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  // ---- An admin, on a laptop ----
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true, home_tiles: {finance_pm: false}});
  const org = me.org_id;
  seedRoles(db, org);
  db.profiles.push({id: 'pmz', name: 'Dan Doc', role: 'pm', org_id: org, email: 'dan@x.co', org_role_id: 'r5', finance_enabled: false});
  db.fin_settings = [{org_id: org, expenses_user: null}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);

  // 1 and 3: the two parts on the Roles board.
  await page.goto(B + '/pm/admin/roles'); await page.waitForTimeout(4500);
  // The Project Manager role is the first on the board, so it's the one showing.
  const lists = () => page.evaluate(() => ({add: [...document.querySelectorAll('[aria-label^="Add "]')].map((e) => e.getAttribute('aria-label')), out: [...document.querySelectorAll('[aria-label^="Take "]')].map((e) => e.getAttribute('aria-label'))}));
  let l = await lists();
  check(l.add.some((x) => /^Add See Material Costs to Project Manager/.test(x)) && l.add.some((x) => /^Add Money On Home to Project Manager/.test(x)), `Roles: Money On Home and See Material Costs are parts; the PM role starts with neither (the old Home Page answer was No for PMs) (${l.add.filter((x) => /Money|Material/.test(x)).join(' | ')})`);
  await page.screenshot({path: path.join(SHOTS, 'board-laptop.png'), fullPage: true});
  await page.locator('[aria-label="Add Money On Home to Project Manager"]').first().click(); await page.waitForTimeout(1200);
  await page.locator('[aria-label="Add See Material Costs to Project Manager"]').first().click(); await page.waitForTimeout(1200);
  const r4 = db.org_roles.find((r) => r.id === 'r4');
  check(JSON.stringify(r4.perms_extra) === JSON.stringify(['home_money', 'mat_costs']) && !r4.perms.includes('home_money') && r4.perms.includes('fin_view'), `saved apart from the other parts (perms_extra ${JSON.stringify(r4.perms_extra)})`);
  // One card since 18 Nov: the brief above the lists is the same role's, so no need to choose it again.
  check(/Can Use (16 Of 17 Parts|Every Part)/.test(await body()), `the role's brief counts 17 parts (${(await body()).match(/Can Use [^\n:]*/)?.[0]})`);

  // 2: Users.
  await page.goto(B + '/pm/admin/users'); await page.waitForTimeout(4500);
  check(await page.getByText('Role Has No Finance', {exact: true}).count() >= 1, 'Users: someone whose role has no Finance – View says "Role Has No Finance", not a switch');
  await page.screenshot({path: path.join(SHOTS, 'users-laptop.png'), fullPage: true});

  // The Admin Centre's lists.
  await page.goto(B + '/pm/admin'); await page.waitForTimeout(4000);
  let t = await body();
  check(!/Material Costs For Operatives/.test(t), 'People: no Material Costs For Operatives (removed, 18 Nov)');
  // Since the sub tabs (later on 18 Nov), Company's pages are tabs: no Home Page among them, Expenses is.
  await page.getByRole('tab', {name: 'Company'}).click(); await page.waitForTimeout(3000);
  t = await body();
  check(!/Home Page/.test(t) && /\nExpenses\n/.test(t), 'Company: no Home Page (it\'s in Roles); Expenses there');

  // 3: Finance › Settings points to Roles for material costs.
  await page.goto(B + '/fin/settings'); await page.waitForTimeout(4500);
  await page.getByText('Who can see material costs', {exact: true}).first().click(); await page.waitForTimeout(600);
  t = await body();
  check(/Office roles get material costs from Admin › Roles/.test(t) && !/Select All|Untick All/.test(t), 'Finance › Settings › material costs points to Roles (no second list)');
  await page.getByText('Purchase invoices', {exact: true}).first().click(); await page.waitForTimeout(600);
  check(/Expense receipts go to \(Admin › Company › Expenses\)/.test(await body()), 'Finance › Settings › Purchase invoices says where who-books-receipts is set');

  // 4: Expenses.
  await page.goto(B + '/pm/admin/expensesemail'); await page.waitForTimeout(4500);
  t = await body();
  check(/Send expenses to/i.test(t) && /Who Books Them In Finance/.test(t), 'Expenses: where receipts go and who books them, on one page');
  await page.getByLabel('Who Books Them In Finance').first().click(); await page.waitForTimeout(600);
  await page.getByText('Andy Admin', {exact: true}).filter({visible: true}).last().click(); await page.waitForTimeout(1500);
  check(db.fin_settings[0].expenses_user === 'me', `choosing who books them saves it (${db.fin_settings[0].expenses_user})`);
  await page.screenshot({path: path.join(SHOTS, 'expenses-laptop.png'), fullPage: true});
  await ctx.close();

  // ---- 1: a PM's Home on a phone follows the role's Money On Home ----
  for (const [extra, want] of [[[], false], [['home_money'], true]]) {
    global.__rpc = (n) => (n === 'my_role_perms_extra' ? extra : undefined);
    const p = await makeContext(browser, 'pm', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(p.db);
    Object.assign(p.db.profiles.find((x) => x.id === 'me'), {role: 'pm', finance_enabled: true, howto_dismissed: ['*']});
    Object.assign(p.db.organizations[0], {has_pm: true, has_finance: true});
    const pg = await p.ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
    await signIn(pg);
    await pg.goto(B + '/home'); await pg.waitForTimeout(5000);
    const has = /Due In/.test(await pg.evaluate(() => document.body.innerText));
    check(has === want, `PM's Home: role ${want ? 'with' : 'without'} Money On Home ${want ? 'shows' : 'hides'} the money (Due In ${has ? 'shown' : 'hidden'})`);
    await p.ctx.close();
  }
  global.__rpc = undefined;

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
