// Invite as a Project Manager or one of the company's own roles (Andy, 19 Nov 2026: "i cant invite as a project manager
// or qs"). An admin chooses Quantity Surveyor: the invite is at Project Manager level with that role on it; a PM only
// gets operatives, drivers and clients. (The database side - admins only, own company, the role given on joining - was
// proved on the live database with a self-undoing test; see docs/claude-code/sql/invite-roles-19nov.sql.)
// Fake database. node inviteroles19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const ROLES = [['Admin', 'admin', true], ['Contracts Administrator', 'pm', false], ['Finance Controller', 'finance_controller', true], ['Project Manager', 'pm', true], ['Quantity Surveyor', 'pm', false], ['Estimator', 'estimator', true], ['Site Manager', 'site_manager', true], ['Operative', 'operative', true], ['Delivery Driver', 'driver', true], ['Client', 'client', true]];

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const who of ['admin', 'pm']) {
    const {ctx, db} = await makeContext(browser, who, [], {viewport: {width: 1300, height: 900}});
    seed(db); Object.assign(db.profiles[0], {role: who, howto_dismissed: ['*']});
    const O = db.organizations[0].id;
    db.org_roles = ROLES.map(([name, access, d], i) => ({id: `role-${i}`, org_id: O, name, access, is_default: d, position: i + 1}));
    db.invites = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    await page.goto(`${B}/pm/admin/invites`); await page.waitForTimeout(4500);
    await page.getByText(/^Invite As:/).first().click(); await page.waitForTimeout(800);
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (who === 'admin') {
      check(/Project Manager/.test(t) && /Quantity Surveyor/.test(t) && /Contracts Administrator/.test(t) && /Estimator/.test(t) && !/Site Manager Operative/.test(t), 'admin: can invite as Project Manager, Quantity Surveyor and the company’s other roles');
      await page.screenshot({path: path.join(__dirname, 'shots', 'inviteroles19-choices.png')});
      await page.getByText('Quantity Surveyor', {exact: true}).last().click(); await page.waitForTimeout(500);
      await page.getByText('Generate One-Time Invite Link', {exact: true}).click(); await page.waitForTimeout(2500);
      const inv = db.invites[db.invites.length - 1] || {};
      check(inv.role === 'pm' && inv.org_role_id === 'role-4', `the invite is at Project Manager level, for Quantity Surveyor (${inv.role} / ${inv.org_role_id})`);
      db.invites.forEach((i) => { if (i.is_reusable == null) i.is_reusable = false; if (i.used_at === undefined) i.used_at = null; if (!i.expires_at) i.expires_at = '2036-01-01T00:00:00Z'; if (!i.created_at) i.created_at = new Date().toISOString(); }); // the real database's defaults
      await page.goto(`${B}/pm/admin/invites`); await page.waitForTimeout(4000);
      check(/Quantity Surveyor · created/.test((await page.locator('body').innerText()).replace(/\s+/g, ' ')), 'the pending invite says Quantity Surveyor');
      await page.getByText(/^Invite As:/).first().click(); await page.waitForTimeout(800);
      await page.getByText('Project Manager', {exact: true}).last().click(); await page.waitForTimeout(500);
      await page.getByText('Generate One-Time Invite Link', {exact: true}).click(); await page.waitForTimeout(2500);
      const inv2 = db.invites[db.invites.length - 1] || {};
      check(inv2.role === 'pm' && !inv2.org_role_id, `Project Manager: a plain Project Manager invite (${inv2.role} / ${inv2.org_role_id || 'no role id'})`);
    } else {
      check(/Operative/.test(t) && /Delivery Driver/.test(t) && /Client/.test(t) && !/Quantity Surveyor/.test(t) && !/Contracts Administrator/.test(t), 'a Project Manager: operatives, drivers and clients only');
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
