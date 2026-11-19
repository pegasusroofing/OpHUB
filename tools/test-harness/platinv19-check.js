// Platform Admin: a new company's admin invite is emailed (Andy, 19 Nov 2026: "can you check the email invite has sent
// from the sign up link as nothing in emails"). Create Company & Invite with an email sends it; a company whose admin
// hasn't signed up yet shows its invite with Email Invite and Copy Link. Server calls caught. Fake database.
// node platinv19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const B = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'superadmin'; me.view_as_org_id = null;
  db.subscriptions = [];
  const future = new Date(Date.now() + 10 * 86400000).toISOString();
  db.organizations.push({id: 'org-new', name: 'Acme Construction Group', plan_tier: 'starter', has_pm: true, created_at: new Date().toISOString()});
  db.invites = [{id: 'inv-old', org_id: 'org-new', role: 'admin', email: 'boss@acme.example', used_at: null, expires_at: future, created_at: new Date().toISOString()}];
  const sent = [];
  await ctx.route(/functions\/v1\/send-invite-email/, (r) => { sent.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}); });
  await ctx.route(/functions\/v1\/admin-create-company/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    db.organizations.push({id: 'org-made', name: b.company_name, plan_tier: 'starter', has_pm: true, created_at: new Date().toISOString()});
    db.invites.push({id: 'inv-made', org_id: 'org-made', role: 'admin', email: b.email || null, used_at: null, expires_at: future, created_at: new Date().toISOString()});
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, org: {id: 'org-made'}, invite_id: 'inv-made'})});
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const text = () => page.evaluate(() => document.body.innerText);

  // Create a company with an email: the invite is emailed.
  await page.getByText('Create Company & Invite', {exact: true}).waitFor({timeout: 30000});
  const box = page.locator('input').filter({visible: true});
  await box.nth(0).fill('Brand New Roofing'); await box.nth(1).fill('owner@brandnew.example');
  check((await text()).toLowerCase().includes('their email (we email them the invite)'), 'the email box says the invite is emailed');
  await page.getByText('Create Company & Invite', {exact: true}).click(); await page.waitForTimeout(3500);
  const s1 = sent.find((x) => x.invite_id === 'inv-made');
  check(!!s1 && s1.email === 'owner@brandnew.example', `Create Company & Invite emails the invite (${JSON.stringify(s1 || null)})`);
  let t = await text();
  check(/Invite email sent to owner@brandnew\.example/.test(t) && /share this link/.test(t), 'it says the invite was emailed, and still shows the link');
  await page.screenshot({path: path.join(__dirname, 'shots', 'platinv19-created.png')});

  // A company whose admin hasn't signed up: Email Invite.
  await page.getByText('Acme Construction Group', {exact: true}).last().click(); await page.waitForTimeout(1200);
  t = await text();
  check(/Admin Invite — Not Signed Up Yet/i.test(t) && /boss@acme\.example/.test(t), 'the company shows its waiting admin invite and its email');
  await page.screenshot({path: path.join(__dirname, 'shots', 'platinv19-waiting.png')});
  await page.getByText('Email Invite', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const s2 = sent.find((x) => x.invite_id === 'inv-old');
  check(!!s2 && s2.email === 'boss@acme.example', `Email Invite sends it to the saved address (${JSON.stringify(s2 || null)})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
