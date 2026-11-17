// What Each Role Can Do (Andy, 17 Nov 2026). Admin › Roles: choose one office role from the Role ▾ drop-down; on the
// left, Options (the parts it hasn't got), on the right, In This Role (the parts it has). Tap a part to move it across
// (→ adds, ← takes out), or drag it across on a computer; each change saves to org_roles.perms. Then someone whose
// role lacks Quotes, Calendar and Create Projects doesn't see them.
// node roles17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'roles17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const PM = ['every_job', 'create_projects', 'prices', 'fin_view', 'quotes', 'sow', 'snags', 'hs_signoff', 'orders', 'docs', 'team', 'people', 'reports', 'notify'];

async function signIn(page) {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
}

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = []; // grey text edges in the screenshots
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  const org = me.org_id;
  const R = (id, name, access, d, pos, perms) => ({id, org_id: org, name, access, is_default: d, position: pos, perms});
  db.org_roles = [
    R('r1', 'Admin', 'admin', true, 1, null), R('r2', 'Contracts Administrator', 'pm', false, 2, PM.slice()),
    R('r3', 'Finance Controller', 'finance_controller', true, 3, ['prices', 'fin_view', 'fin_edit', 'reports']),
    R('r4', 'Project Manager', 'pm', true, 4, PM.slice()), R('r5', 'Document Controller', 'pm', false, 5, ['every_job', 'docs']),
    R('r6', 'Estimator', 'estimator', true, 6, null), R('r7', 'Site Manager', 'site_manager', true, 7, PM.filter((k) => k !== 'prices')),
    R('r8', 'Operative', 'operative', true, 8, null), R('r9', 'Delivery Driver', 'driver', true, 9, null),
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const warns = []; page.on('console', (m) => { if (/cannot contain a nested|cannot be a descendant/.test(m.text())) warns.push(m.text().slice(0, 120)); });
  const body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);

  await page.goto(B + '/pm/admin/roles'); await page.waitForTimeout(4000);
  let t = await body();
  const lists = () => body().then((x) => {
    const s = x.slice(x.indexOf('What Each Role Can Do'));
    const o = s.indexOf('\nOptions\n'), r = s.indexOf('\nIn This Role\n');
    return {all: s, options: s.slice(o, r), role: s.slice(r)};
  });
  check(t.includes('What Each Role Can Do'), 'the board is on Admin › Roles');
  let L = await lists();
  check(/Role\nContracts Administrator\n/.test(L.all), 'the Role ▾ drop-down starts on the first office role (Contracts Administrator)');
  check(/Options\n1\nFinance – Edit\n/.test(L.options) && !/Every Job/.test(L.options), 'Options lists only what the role hasn’t got (Finance – Edit)');
  check(/In This Role\n14\n/.test(L.role) && /Every Job/.test(L.role) && !/Finance – Edit/.test(L.role), 'In This Role lists its 14 parts');
  check(!/Document Controller|Estimator|Finance Controller/.test(L.all.slice(L.all.indexOf('\nRole\n'))), 'only one role on show at a time');
  await page.getByText('What Each Role Can Do', {exact: true}).evaluate((e) => e.scrollIntoView({block: 'start'})); await page.waitForTimeout(400); await page.screenshot({path: path.join(SHOTS, 'board-laptop.png')});

  // The drop-down lists the office roles only.
  await page.getByLabel('Role', {exact: true}).click(); await page.waitForTimeout(600);
  t = await body();
  const menu = t.slice(t.lastIndexOf('Choose A Role'));
  check(['Contracts Administrator', 'Finance Controller', 'Project Manager', 'Document Controller', 'Estimator', 'Site Manager'].every((n) => menu.includes(n)), 'the drop-down has each office role');
  check(!/\nAdmin\n|\nOperative\n|\nDelivery Driver\n/.test(menu), 'no Admin, Operative or Driver in it');
  await page.screenshot({path: path.join(SHOTS, 'board-dropdown.png')});
  await page.getByText('✓ Contracts Administrator', {exact: true}).click(); await page.waitForTimeout(500);

  // → moves Finance – Edit into Contracts Administrator, and it leaves Options.
  await page.getByLabel('Add Finance – Edit to Contracts Administrator', {exact: true}).click(); await page.waitForTimeout(1500);
  const ca = () => db.org_roles.find((r) => r.id === 'r2').perms;
  check(ca().includes('fin_edit') && ca().length === PM.length + 1 && ca().indexOf('fin_edit') === 4, `→ adds it, saved in the board's order (${ca().length} parts)`);
  L = await lists();
  check(/It Has Everything/.test(L.options) && /Finance – Edit/.test(L.role), 'it moves across: Options now says It Has Everything');
  // ← takes it out again.
  await page.getByLabel('Take Finance – Edit out of Contracts Administrator', {exact: true}).click(); await page.waitForTimeout(1500);
  check(!ca().includes('fin_edit'), '← takes it out and saves');
  L = await lists();
  check(/Finance – Edit/.test(L.options) && !/Finance – Edit/.test(L.role), 'and it goes back to Options');
  // Untouched roles stay as they were; an unset role (Estimator) still means everything.
  check(db.org_roles.find((r) => r.id === 'r6').perms === null, 'other roles untouched');

  // Choose Document Controller: its own lists only.
  await page.getByLabel('Role', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('Document Controller', {exact: true}).last().click(); await page.waitForTimeout(800);
  L = await lists();
  check(/Role\nDocument Controller\n/.test(L.all) && /In This Role\n2\n/.test(L.role) && /Options\n13\n/.test(L.options), 'Document Controller chosen: 2 in the role, 13 options');
  // Drag Reports across into the role.
  await page.getByLabel('Add Reports to Document Controller', {exact: true}).dragTo(page.getByText('In This Role', {exact: true})); await page.waitForTimeout(1500);
  const dc = db.org_roles.find((r) => r.id === 'r5').perms;
  check(dc.includes('reports') && dc.length === 3, `dragged across on a computer: ${dc.join(', ')}`);
  // Site Manager shows what its level can't do.
  await page.getByLabel('Role', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('Site Manager', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(/Site Managers only see the jobs they.re put on/.test(await body()), 'Site Manager: the note about its level');

  // Phone: the two lists side by side, nothing off the side.
  await page.setViewportSize({width: 390, height: 844}); await page.goto(B + '/pm/admin/roles'); await page.waitForTimeout(3500);
  await page.getByText('What Each Role Can Do', {exact: true}).evaluate((e) => e.scrollIntoView({block: 'start'})); await page.waitForTimeout(400); await page.screenshot({path: path.join(SHOTS, 'board-phone.png')});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'phone: nothing runs off the side');
  const side = await page.evaluate(() => {
    const at = (s) => [...document.querySelectorAll('div')].find((e) => e.textContent === s)?.getBoundingClientRect();
    const o = at('Options'), r = at('In This Role');
    return o && r ? Math.abs(o.top - r.top) < 4 && r.left > o.right : false;
  });
  check(side, 'phone: Options and In This Role sit side by side');
  await page.getByLabel('Add Finance – Edit to Contracts Administrator', {exact: true}).click(); await page.waitForTimeout(1500);
  check(ca().includes('fin_edit'), 'phone: a tap moves it across');

  // A PM whose role has no Quotes, Calendar or Create Projects.
  const b2 = await makeContext(browser, 'pm', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(b2.db);
  Object.assign(b2.db.profiles.find((p) => p.id === 'me'), {role: 'pm', howto_dismissed: ['*']});
  global.__rpc = (name) => (name === 'my_role_perms' ? ['every_job', 'sow', 'snags', 'docs', 'reports', 'people'] : undefined);
  const p2 = await b2.ctx.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await signIn(p2);
  await p2.goto(B + '/home'); await p2.waitForTimeout(4000);
  t = await p2.evaluate(() => document.body.innerText);
  check(!/\nQuotes\n/.test(t) && !/Tender tracker/.test(t), 'no Quotes in the menu or on Home');
  check(!/\nCalendar\n/.test(t) && !/Next 5 Days|NEXT 5 DAYS/i.test(t), 'no Calendar');
  check(/Reports & Surveys/.test(t), 'Reports still there');
  await p2.screenshot({path: path.join(SHOTS, 'pm-limited-home.png'), fullPage: true});
  await p2.goto(B + '/sites'); await p2.waitForTimeout(3500);
  t = await p2.evaluate(() => document.body.innerText);
  check(!/\+ New Project/.test(t), 'no + New Project');
  await p2.goto(B + '/sites/new'); await p2.waitForTimeout(3000);
  t = await p2.evaluate(() => document.body.innerText);
  check(/Your role doesn’t create projects/.test(t), 'New Project explains why');
  global.__rpc = undefined;

  check(!warns.length, `no React warnings ${warns.slice(0, 2).join(' | ')}`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
