// Admin › H&S › H&S Emails (19 Nov 2026): where a company admin sets the office copy of the report, COSHH, HAVS, PUWER
// and incident emails (organizations.report_cc_email). An admin sees it, a bad address is refused, a good one is saved
// (tidied), and a blank box clears it. A PM has no H&S Emails tab and the page says admins only. Laptop and phone.
// Fake database. node hsemails19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'hsemails19');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const until = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, {timeout: 10000}).catch(() => null);
const subTabs = (page) => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.trim()));
const setUp = async (browser, role, opts) => {
  const c = await makeContext(browser, role, [], opts);
  require('./seeds/world')(c.db);
  Object.assign(c.db.profiles.find((p) => p.id === 'me'), {role, howto_dismissed: ['*']});
  Object.assign(c.db.organizations[0], {has_pm: true, report_cc_email: null});
  return c;
};

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  // ---- An admin, on a laptop ----
  let {ctx, db} = await setUp(browser, 'admin', {viewport: {width: 1300, height: 900}});
  let page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  let body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);
  await page.goto(`${B}/pm/admin/hsemails`); await page.waitForTimeout(4500);
  let t = await body();
  const tabs = await subTabs(page);
  check(tabs.includes('H&S') && tabs.includes('H&S Emails') && tabs.includes('Toolbox Talks'), `the admin has H&S Emails among the H&S sub tabs (${tabs.join(' · ')})`);
  check(/Copy health & safety emails to/.test(t) && /No office copy at the moment/.test(t), 'the field shows, with no office copy yet');
  const box = page.getByLabel('Copy health and safety emails to', {exact: true});
  await box.fill('office@example'); await page.getByText('Save', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Enter a valid email address/.test(t) && !db.organizations[0].report_cc_email, 'a bad address is refused and nothing is saved');
  await page.screenshot({path: path.join(SHOTS, 'admin-bad.png'), fullPage: true});
  await box.fill('  Office@Example.co.uk ');
  check(!/Enter a valid email address/.test(await body()), 'the warning goes as soon as the address is changed');
  await page.getByText('Save', {exact: true}).click(); await until(page, /✓ Copies go to/);
  t = await body();
  check(db.organizations[0].report_cc_email === 'office@example.co.uk', `a good address is saved, tidied (${db.organizations[0].report_cc_email})`);
  check(/✓ Copies go to office@example\.co\.uk/.test(t) && await page.getByText('Saved', {exact: true}).count() > 0, 'the page says where copies go and the button says Saved');
  await page.screenshot({path: path.join(SHOTS, 'admin-laptop.png'), fullPage: true});
  await box.fill(''); await page.getByText('Save', {exact: true}).click(); await until(page, /No office copy at the moment/);
  t = await body();
  check(db.organizations[0].report_cc_email === null && /No office copy at the moment/.test(t), 'a blank box clears it');
  // The 🔍 finds it.
  await page.goto(`${B}/pm/admin?search=1`); await page.waitForTimeout(3500);
  await page.getByRole('textbox', {name: 'Search the Admin Centre'}).fill('office'); await page.waitForTimeout(600);
  check(/H&S Emails/.test(await body()), 'searching "office" finds H&S Emails');
  await ctx.close();

  // ---- An admin, on a phone ----
  ({ctx, db} = await setUp(browser, 'admin', {shot: true}));
  db.organizations[0].report_cc_email = 'office@example.co.uk';
  page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);
  await page.goto(`${B}/pm/admin/hsemails`); await page.waitForTimeout(4500);
  t = await body();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(/Copy health & safety emails to/.test(t) && /✓ Copies go to office@example\.co\.uk/.test(t) && wide, 'on a phone it shows the saved address and nothing runs off the side');
  await page.screenshot({path: path.join(SHOTS, 'admin-phone.png'), fullPage: true});
  await ctx.close();

  // ---- A PM ----
  ({ctx, db} = await setUp(browser, 'pm', {viewport: {width: 1300, height: 900}}));
  db.organizations[0].report_cc_email = 'office@example.co.uk';
  page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);
  await page.goto(`${B}/pm/admin?page=hs`); await page.waitForTimeout(4500);
  const pmTabs = await subTabs(page);
  check(pmTabs.includes('H&S Policy') && !pmTabs.includes('H&S Emails'), `a PM has the H&S tab but no H&S Emails (${pmTabs.join(' · ')})`);
  await page.goto(`${B}/pm/admin/hsemails`); await page.waitForTimeout(4000);
  t = await body();
  check(/Company admins only/.test(t) && !/office@example/.test(t), 'a PM opening the page directly sees "Company admins only" and not the address');
  await page.screenshot({path: path.join(SHOTS, 'pm-laptop.png'), fullPage: true});
  await ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
