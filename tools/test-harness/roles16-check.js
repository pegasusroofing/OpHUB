// Roles (Andy, 16 Nov 2026: "a selection of roles? Admin, Contracts administrator, Finance controller, Project manager,
// Quantity surveyor, Document controller, Contracts manager, Operative ... a set list that the admin can see, but also add
// and remove"). Admin Centre › Roles lists them with what each uses the app as and how many people have it; + Add A Role;
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
  check(['Admin', 'Contracts Administrator', 'Finance Controller', 'Project Manager', 'Quantity Surveyor', 'Document Controller', 'Contracts Manager', 'Operative'].every((n) => t.includes(n)), 'Andy’s roles are listed');
  check(/Uses The App As Project Manager/.test(t) && /Nobody Yet/.test(t) && /\d+ People?/.test(t), 'each says what it uses the app as and how many have it');
  await page.screenshot({path: path.join(SHOTS, 'roles-laptop.png'), fullPage: true});

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
  await page.getByLabel(/^Quantity Surveyor: 0 people/).click(); await page.waitForTimeout(800);
  await page.getByText('Remove This Role', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByText('Yes, Remove', {exact: true}).last().click(); await page.waitForTimeout(2500);
  check(!db.org_roles.some((r) => r.name === 'Quantity Surveyor'), 'Quantity Surveyor removed');
  // One people have: no Remove, and its level is fixed.
  await page.getByLabel(/^Project Manager: [1-9]/).click(); await page.waitForTimeout(800);
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
