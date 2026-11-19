// Company switching on one login (Andy, 19 Nov 2026: "i can log into rtbroofing limited and rtb construction through one
// email and top left in the side bar i can change companies"). Checks, on the beta screens with a fake database:
//  - one company: no switcher; two companies: the sidebar header says Switch Company ▾ and switches;
//  - after a switch the app shows the other company and its role (the database rewrote the profile);
//  - My Account › My Companies lists both with the email for each, and the email can be changed;
//  - Admin › People › Also Has Access lists someone in another company right now, and Remove Access takes it away;
//  - an invite link opened while signed in offers "Add {Company} To My Account" instead of a new account.
// The real rules live in the database (docs/claude-code/sql/company-switching-19nov.sql) and were proven there with
// tests that undo themselves. node switch19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const shot = (p, n) => p.screenshot({path: path.join(__dirname, 'shots', 'switch19', n + '.png')});

(async () => {
  require('fs').mkdirSync(path.join(__dirname, 'shots', 'switch19'), {recursive: true});
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); const me = db.profiles[0]; Object.assign(me, {role: 'admin', howto_dismissed: ['*'], email: 'a@x.co'});
  const O = db.organizations[0].id; const O2 = 'org-construction';
  db.organizations.push({id: O2, name: 'RTB Construction Group', color_primary: '#1F4E79', color_secondary: '#111111', logo_path: null, has_pm: true, has_finance: false, created_at: new Date().toISOString()});
  // The fake database's switching functions: memberships held here, the profile rewritten on a switch.
  const mem = [{org_id: O, role: 'admin', work_email: 'a@x.co'}];
  let elsewhere = [{user_id: 'u-sam', name: 'Sam Other', work_email: 'sam@other.example', role: 'pm', last_used_at: null}];
  const calls = [];
  global.__rpc = (n, b) => {
    if (['my_companies', 'switch_company', 'set_company_email', 'company_access_elsewhere', 'remove_company_access', 'join_company_with_invite', 'get_invite_info'].includes(n)) calls.push(n);
    if (n === 'my_companies') return mem.map((m) => ({...m, name: db.organizations.find((o) => o.id === m.org_id).name, logo_path: null, is_current: m.org_id === me.org_id})).sort((a, c) => (c.is_current ? 1 : 0) - (a.is_current ? 1 : 0));
    if (n === 'switch_company') {
      const m = mem.find((x) => x.org_id === b.p_org_id); if (!m) return {error: 'not_a_member'};
      const cur = mem.find((x) => x.org_id === me.org_id); cur.role = me.role; cur.work_email = me.email;
      Object.assign(me, {org_id: m.org_id, role: m.role, email: m.work_email}); return {ok: true};
    }
    if (n === 'set_company_email') { const m = mem.find((x) => x.org_id === b.p_org_id); m.work_email = b.p_email; if (m.org_id === me.org_id) me.email = b.p_email; return {ok: true}; }
    if (n === 'company_access_elsewhere') return elsewhere;
    if (n === 'remove_company_access') { elsewhere = elsewhere.filter((p) => p.user_id !== b.p_user_id); return {ok: true}; }
    if (n === 'get_invite_info') return [{org_name: 'RTB Construction Group', is_valid: true, logo_path: null, color_primary: '#1F4E79', color_secondary: '#111111'}];
    if (n === 'join_company_with_invite') { if (mem.some((x) => x.org_id === O2)) return {error: 'already_member'}; mem.push({org_id: O2, role: 'pm', work_email: 'a@x.co'}); return {ok: true, org_id: O2, company: 'RTB Construction Group'}; }
    return undefined;
  };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = () => page.evaluate(() => document.body.innerText);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // One company: no switcher.
  check(!/Switch Company/.test(await text()), 'with one company there is no Switch Company');

  // Open the invite while signed in: add the company to this login.
  await page.goto(`${B}/join/inv-123`); await page.waitForTimeout(4500);
  let t = await text();
  check(/Add RTB Construction Group\?/.test(t) && /Add RTB Construction Group To My Account/.test(t) && !/Join Team/.test(t), 'signed in, the invite offers Add RTB Construction Group To My Account (no new account form)');
  await shot(page, 'join-signed-in');
  await page.getByText('Add RTB Construction Group To My Account', {exact: true}).click(); await page.waitForTimeout(1500);
  check(/RTB Construction Group is on your account\. Switch to it now\?/.test(await text()), 'it asks Switch to it now? (Yes / No)');
  await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(4500);
  check(calls.includes('join_company_with_invite') && me.org_id === O, 'No keeps you in RTB Roofing, with the new company added');

  // Two companies: the sidebar header switches.
  await page.goto(`${B}/home`); await page.waitForTimeout(5000);
  t = await text();
  check(/Switch Company/.test(t), 'with two companies the sidebar header says Switch Company');
  await shot(page, 'sidebar-two-companies');
  await page.getByLabel(/Switch Company/).first().click(); await page.waitForTimeout(800);
  t = await text();
  check(/✓ RTB Roofing Ltd/.test(t) && /RTB Construction Group/.test(t), 'the list shows both companies, the current one ticked');
  await shot(page, 'switch-list');
  await page.getByText('RTB Construction Group', {exact: true}).last().click(); await page.waitForTimeout(6000);
  t = await text();
  check(calls.includes('switch_company') && me.org_id === O2, 'choosing RTB Construction Group switches company');
  check(/RTB Construction Group/.test(t) && page.url().endsWith('/home'), 'the app now shows RTB Construction Group, on Home');
  await shot(page, 'after-switch');

  // My Account › My Companies, change the construction email.
  await page.goto(`${B}/account`); await page.waitForTimeout(4500);
  t = await text();
  check(/My Companies/i.test(t) && /RTB Construction Group \(Current\)/.test(t) && /RTB Roofing Ltd/.test(t) && /Email for this company/.test(t), 'My Account lists My Companies, the current one marked, with the email for each');
  await page.getByLabel('RTB Construction Group: switch or change email').click(); await page.waitForTimeout(700);
  check(!/Switch To This Company/.test(await text()), 'the current company offers only the email change');
  await page.getByText('Change The Email For This Company', {exact: true}).click(); await page.waitForTimeout(700);
  await page.locator('input').last().fill('andy@rtbconstruction.example');
  await page.getByText('OK', {exact: true}).last().click().catch(() => page.keyboard.press('Enter')); await page.waitForTimeout(3500);
  check(mem.find((m) => m.org_id === O2).work_email === 'andy@rtbconstruction.example' && me.email === 'andy@rtbconstruction.example', 'the construction email is saved, and is your email while you are in it');
  t = await text();
  check(/andy@rtbconstruction\.example/.test(t), 'My Companies shows the new email');
  await shot(page, 'my-companies');

  // Switch back from My Companies.
  await page.getByLabel('RTB Roofing Ltd: switch or change email').click(); await page.waitForTimeout(700);
  await page.getByText('Switch To This Company', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByText('RTB Roofing Ltd', {exact: true}).last().click(); await page.waitForTimeout(6000);
  check(me.org_id === O && me.role === 'admin' && me.email === 'a@x.co', 'switching back gives RTB Roofing, admin, with its own email');

  // Admin › People › Also Has Access.
  await page.goto(`${B}/pm/admin/users`); await page.waitForTimeout(5000);
  t = await text();
  check(/Also Has Access/i.test(t) && /Sam Other/.test(t) && /sam@other\.example/.test(t), 'Admin › People shows Also Has Access with Sam Other');
  await shot(page, 'also-has-access');
  await page.getByLabel("Remove Sam Other's access").click(); await page.waitForTimeout(700);
  check(/Remove Sam Other's access to RTB Roofing Ltd\? Their other companies aren't affected\./.test(await text()), 'Remove Access asks first (Yes / No)');
  await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(3000);
  t = await text();
  check(calls.includes('remove_company_access') && !/Sam Other/.test(t) && !/Also Has Access/i.test(t), 'Yes removes their access and the section goes');

  // On a phone: the top of the menu switches company too.
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${B}/home`); await page.waitForTimeout(5000);
  await page.getByLabel('Open the menu').first().click(); await page.waitForTimeout(1200);
  check(/Switch Company/.test(await text()), 'on a phone the menu shows Switch Company at the top');
  await shot(page, 'phone-menu');
  await page.getByLabel(/Switch Company/).first().click(); await page.waitForTimeout(1000);
  await page.getByText('RTB Construction Group', {exact: true}).last().click(); await page.waitForTimeout(6000);
  check(me.org_id === O2, 'switching from the phone menu works');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
