// Roles (Andy, 16 Nov 2026: "a selection of roles? Admin, Contracts administrator, Finance controller, Project manager,
// Quantity surveyor, Document controller, Contracts manager, Operative ... a set list that the admin can see, but also add
// and remove"). Admin Centre › Roles: choose one from the Your Roles drop-down for a brief (what it uses the app as, who
// has it; Andy, 17 Nov 2026: "a lot more compact ... a drop down that then gives a brief"); Edit Role, + Add A Role;
// a role nobody has can be removed, one people have can't change level. Users is grouped under the roles, and a company
// admin gives someone any role. The real rules are proven in SQL (docs/claude-code/sql/org-roles-16nov.sql).
// node roles16-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'roles16');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  db.org_roles = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  await page.goto(B + '/pm/admin/roles'); await page.waitForTimeout(4000);
  let t = await body();
  const yours = () => body().then((x) => x.slice(x.indexOf('Your Roles'), x.indexOf('What Each Role Can Do')));
  t = await yours();
  check(/\nAdmin\n▾\nUses The App As Company Admin/.test(t) && !/Contracts Administrator/.test(t), `Your Roles shows one role at a time, Admin first (${t.replace(/\n/g, ' | ').slice(0, 220)})`);
  const pickRole = async (n) => {
    await page.getByLabel('Your Roles', {exact: true}).click(); await page.waitForTimeout(600);
    await page.getByText(n, {exact: true}).last().click(); await page.waitForTimeout(800);
  };
  await page.getByLabel('Your Roles', {exact: true}).click(); await page.waitForTimeout(600);
  t = await body();
  const menu = t.slice(t.lastIndexOf('Your Roles'));
  check(['Admin', 'Contracts Administrator', 'Finance Controller', 'Project Manager', 'Quantity Surveyor', 'Document Controller', 'Contracts Manager', 'Operative'].every((n) => menu.includes(n)), 'Andy’s roles are in the drop-down');
  await page.screenshot({path: path.join(SHOTS, 'roles-dropdown.png')});
  await page.getByText('Project Manager', {exact: true}).last().click(); await page.waitForTimeout(800);
  t = await yours();
  check(/Uses The App As Project Manager/.test(t) && /\d+ (Person|People): \w/.test(t) && /Can Use (Every Part|\d+ Of 17 Parts)/.test(t), `the brief: what it uses the app as, who has it, its parts (${t.replace(/\n/g, ' | ').slice(0, 160)})`);
  check(/\nRole\nProject Manager\n/.test(await body()), 'the same role opens in What Each Role Can Do');
  await page.screenshot({path: path.join(SHOTS, 'roles-laptop.png'), fullPage: true});
  await pickRole('Quantity Surveyor');
  check(/Nobody Yet/.test(await yours()), 'a role nobody has says Nobody Yet');

  // + Add A Role: Site Supervisor, uses the app as a Site Manager.
  await page.getByText('+ Add A Role', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByLabel('Role name', {exact: true}).fill('Site Supervisor');
  await page.getByLabel('Uses The App As', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.getByText('Site Manager', {exact: true}).last().click(); await page.waitForTimeout(400);
  await page.screenshot({path: path.join(SHOTS, 'roles-add.png')});
  await page.getByText('Add Role', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const ss = db.org_roles.find((r) => r.name === 'Site Supervisor');
  check(!!ss && ss.access === 'site_manager' && db.org_roles.length === 13, `added (the starting list saved first): ${db.org_roles.length} roles`);

  // A role nobody has can be removed.
  t = await yours();
  check(/\nSite Supervisor\n/.test(t) && /Uses The App As Site Manager/.test(t), 'the role just added is the one on show');
  await pickRole('Quantity Surveyor'); await page.getByText('Edit Role', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByText('Remove This Role', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByText('Yes, Remove', {exact: true}).last().click(); await page.waitForTimeout(2500);
  check(!db.org_roles.some((r) => r.name === 'Quantity Surveyor'), 'Quantity Surveyor removed');
  // One people have: no Remove, and its level is fixed.
  await pickRole('Project Manager'); await page.getByText('Edit Role', {exact: true}).click(); await page.waitForTimeout(800);
  t = await body();
  check(!/Remove This Role/.test(t) && /Move them to another role to change this/.test(t), 'a role people have: no Remove, level fixed');
  await page.getByLabel('Close', {exact: true}).last().click(); await page.waitForTimeout(500);

  // Users: grouped under the roles; an admin gives Dave Price the Contracts Manager role.
  await page.goto(B + '/pm/admin/users'); await page.waitForTimeout(4000);
  t = await body();
  check(/Change The List Of Roles/.test(t) && /\nProject Manager\n/i.test(t) && /\nOperative\n/i.test(t), 'Users grouped under the roles, with a link to the list');
  const dave = db.profiles.find((p) => p.name === 'Dave Price');
  await page.getByText('Dave Price', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.getByText(/^Role: Project Manager/).last().click(); await page.waitForTimeout(800);
  await page.getByText('Contracts Manager', {exact: true}).last().click(); await page.waitForTimeout(800);
  await page.getByText('Change', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const cm = db.org_roles.find((r) => r.name === 'Contracts Manager');
  check(!!dave && !!cm && dave.org_role_id === cm.id && dave.role === 'pm', `Dave Price is now a Contracts Manager (still a PM underneath): ${dave && dave.org_role_id}`);
  await page.waitForTimeout(1000);
  t = await body();
  check(/\nContracts Manager\n/i.test(t), 'he shows under Contracts Manager');
  await page.screenshot({path: path.join(SHOTS, 'users-laptop.png'), fullPage: true});

  // Phone.
  await page.setViewportSize({width: 390, height: 844}); await page.goto(B + '/pm/admin/roles'); await page.waitForTimeout(3500);
  await page.screenshot({path: path.join(SHOTS, 'roles-phone.png'), fullPage: true});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'phone: nothing runs off the side');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
