// Andy, 18 Nov 2026, the Admin Centre's People pages and Settings:
// - Users: "compact the row heights in users please, also remove the link top right to roles"; tapping an operative
//   offers the Operatives Hub, "where it shows the subcontractor sign ups".
// - Check-In Logs: "move the driver check in logs into check in logs ... a type drop down list for who to search for,
//   also allow for searching by role, i can type in site managers etc and it pulls all, or their name. remove the two
//   buttons weekly monthly and leave it as a date range".
// - Settings: "the rows throughout the settings are really deep ... make them less tall".
// Laptop and phone. Fake database. node people18-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'people18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
// The height of the tappable row holding some words.
const rowH = (page, words) => page.evaluate((w) => {
  const e = [...document.querySelectorAll('div[dir="auto"], span')].find((x) => x.textContent.trim() === w && x.getBoundingClientRect().width > 0);
  let r = e; while (r && !(r.getAttribute('role') === 'button' || r.tabIndex === 0)) r = r.parentElement;
  return r ? Math.round(r.getBoundingClientRect().height) : null;
}, words);

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  const O = me.org_id;
  db.profiles.push({id: 'sm1', name: 'Sam Steel', role: 'site_manager', org_id: O, email: 's@x.co'});
  const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  db.checkins = [
    {id: 'c1', org_id: O, user_id: 'o1', site_id: S1, type: 'in', ts: at(7)}, {id: 'c2', org_id: O, user_id: 'o1', site_id: S1, type: 'out', ts: at(15)},
    {id: 'c3', org_id: O, user_id: 'sm1', site_id: S1, type: 'in', ts: at(8)}, {id: 'c4', org_id: O, user_id: 'sm1', site_id: S1, type: 'out', ts: at(12)},
  ];
  const driver = db.profiles.find((p) => p.role === 'driver');
  db.driver_checkins = driver ? [{id: 'd1', org_id: O, user_id: driver.id, type: 'in', ts: at(6), lat: 51.5, lon: -0.1}, {id: 'd2', org_id: O, user_id: driver.id, type: 'out', ts: at(14), lat: 51.5, lon: -0.1}] : [];
  db.driver_breaks = driver ? [{id: 'b1', org_id: O, user_id: driver.id, started_at: at(10), ended_at: new Date(+new Date(at(10)) + 30 * 60000).toISOString()}] : [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);

  // ---- Users ----
  await page.goto(B + '/pm/admin/users'); await page.waitForTimeout(4500);
  let t = await body();
  check(!/Change The List Of Roles/.test(t), 'Users: no link to Roles');
  const uh = await rowH(page, 'Jake Morris');
  check(!!uh && uh <= 44, `Users: compact one-line rows (${uh}px; were about 62)`);
  await page.screenshot({path: path.join(SHOTS, 'users-laptop.png')});
  await page.getByText('Jake Morris', {exact: true}).first().click(); await page.waitForTimeout(800);
  check(/Open In Operatives Hub/.test(await body()), 'tapping an operative offers the Operatives Hub');
  await page.getByText(/Open In Operatives Hub/).first().click(); await page.waitForTimeout(4000);
  t = await body();
  check(new URL(page.url()).pathname === '/pm/operatives/o1' && /Subcontractor Form/i.test(t), `it opens their page, with the Subcontractor Form (${new URL(page.url()).pathname})`);

  // ---- Check-In Logs ----
  await page.goto(B + '/pm/admin/checkinlogs'); await page.waitForTimeout(5000);
  t = await body();
  const subs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((e) => e.innerText.trim()));
  check(!subs.includes('Driver Check-In Log') && subs.includes('Check-In Logs'), 'one Check-In Logs tab: the drivers are in it');
  check(!/\nWeekly\n|\nMonthly\n/.test(t) && await page.getByLabel('From').count() >= 1 && await page.getByLabel('To').count() >= 1, 'no Weekly / Monthly: a From and To date');
  check(/Jake Morris/.test(t) && /Sam Steel/.test(t) && (!driver || t.includes(driver.name)), `Everyone: operatives, site managers and drivers (${driver?.name || 'no driver in the seed'})`);
  check(!driver || /30m Breaks/i.test(t), 'a driver\'s breaks shown (and taken off their hours)');
  await page.screenshot({path: path.join(SHOTS, 'checkins-laptop.png'), fullPage: true});
  await page.getByLabel('Search a name or a role').fill('site managers'); await page.waitForTimeout(600);
  t = await body();
  check(/Sam Steel/.test(t) && !/Jake Morris/.test(t), 'typing "site managers" finds the site managers');
  await page.getByLabel('Search a name or a role').fill('jake'); await page.waitForTimeout(600);
  t = await body();
  check(/Jake Morris/.test(t) && !/Sam Steel/.test(t), 'or a name');
  await page.getByLabel('Search a name or a role').fill(''); await page.waitForTimeout(300);
  await page.getByLabel('Type').first().click(); await page.waitForTimeout(600);
  await page.getByText('Operatives', {exact: true}).last().click(); await page.waitForTimeout(800);
  t = await body();
  check(/Jake Morris/.test(t) && !/Sam Steel/.test(t), 'Type ▾ Operatives: just the operatives');
  await ctx.close();

  // ---- Settings on a phone: shorter rows ----
  const p = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(p.db);
  Object.assign(p.db.profiles.find((x) => x.id === 'me'), {role: 'admin', howto_dismissed: ['*'], phone: '07700 900111'});
  const pg = await p.ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  await signIn(pg);
  await pg.goto(B + '/account'); await pg.waitForTimeout(4500);
  const sh = await rowH(pg, 'Phone Number');
  check(!!sh && sh <= 50, `Settings: rows less tall (Phone Number ${sh}px; was 72)`);
  await pg.screenshot({path: path.join(SHOTS, 'settings-phone.png')});
  await pg.goto(B + '/pm/admin/checkinlogs'); await pg.waitForTimeout(4500);
  await pg.screenshot({path: path.join(SHOTS, 'checkins-phone.png'), fullPage: true});
  check(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'phone: Check-In Logs fits the screen');
  await p.ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
