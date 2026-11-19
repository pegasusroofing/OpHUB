// The subcontractor sign-up link signs them up to the app first (Andy, 19 Nov 2026: it "needs to take them to the sign up
// page that when they sign up, then takes them straight to the subcontractor sign up page"). Settings shows the link with
// the company's joining invite; opened signed out it goes to the sign-up page; once they sign in, Home opens the form.
// Fake database. node signuplink19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const INV = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // The office: the link on the settings page.
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    seed(db); Object.assign(db.profiles[0], {role: 'admin', howto_dismissed: ['*']});
    db.invites = [{id: INV, org_id: db.organizations[0].id, role: 'operative', is_reusable: true, used_at: null, expires_at: '2036-01-01T00:00:00Z', created_at: new Date().toISOString()}];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    await page.goto(`${B}/pm/admin/subapps`); await page.waitForTimeout(4500);
    const t = await page.evaluate(() => document.body.innerText);
    check(t.includes(`/subcontractor?invite=${INV}`) && /sign up to the app first, then go straight to the form/.test(t), 'settings: the link signs them up to the app first, then the form');
    await page.screenshot({path: require('path').join(__dirname, 'shots', 'signuplink19-settings.png')});
    await ctx.close();
  }
  // A subcontractor: the link, signed out, then signing in.
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    seed(db); Object.assign(db.profiles[0], {role: 'operative', howto_dismissed: ['*'], subform_required: null});
    global.__rpc = (n) => (n === 'get_invite_info' ? [{org_name: 'RTB Roofing Ltd', is_valid: true}] : n === 'get_subform_template' ? null : undefined);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${B}/subcontractor?invite=${INV}`); await page.waitForTimeout(6000);
    check(new URL(page.url()).pathname === `/join/${INV}`, `signed out, the link opens the sign-up page (${new URL(page.url()).pathname})`);
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(8000);
    check(new URL(page.url()).pathname === '/subform' && /Subcontractor form/i.test(await page.evaluate(() => document.body.innerText)), `once signed in, it goes straight to the subcontractor form (${new URL(page.url()).pathname})`);
    // Only once: Home next time is Home.
    await page.goto(`${B}/home`); await page.waitForTimeout(4000);
    check(new URL(page.url()).pathname === '/home', 'and only the once');
    global.__rpc = undefined;
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
