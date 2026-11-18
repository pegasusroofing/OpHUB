// The laptop's project page as the phone's (Andy, 18 Nov 2026: "we made changes to the phone view re the hub etc. can we
// mimic this in the laptop view" and "we need to rethink the hub, the hub is on the left already, but there is an inbox
// and to do list in the laptop view. maybe make the hub a row in the project?"). A manager on a laptop: the project's
// rows have HUB (not To Do List), opening the HUB with that project only; the menu's This Project has HUB (not Inbox);
// an operative keeps the job's Inbox. Also the weather on the laptop's project strip isn't covered by the Not Checked In
// badge. Fake database. node hub18-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S2 = '22222222-2222-2222-2222-222222222222';
const SHOTS = path.join(__dirname, 'shots', 'hub18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
// The menu's own words: everything left of 250px.
const menuText = (page) => page.evaluate(() => [...document.querySelectorAll('div[dir="auto"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right < 250; }).map((e) => e.textContent.trim()).filter(Boolean));

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id;
  db.todos.push({id: 'td2', org_id: O, site_id: S2, text: 'Order Cleveland skip', done: false, created_by: 'me', assigned_to: 'me', created_at: new Date().toISOString()});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);

  await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(6000);
  let t = await body();
  check(!/To Do List/.test(t) && /\nHUB\n/.test(t) && /Messages & to-dos/.test(t), 'project rows: HUB (messages and to-dos), no To Do List');
  const m = await menuText(page);
  const at = m.indexOf('THIS PROJECT');
  check(at >= 0 && m.slice(at).includes('HUB') && !m.slice(at).includes('Inbox'), `menu, This Project: HUB, not Inbox (${m.slice(at, at + 12).join(' | ')})`);
  const wx = await page.evaluate(() => { const w = document.querySelector('[aria-label^="Weather:"]'), p = [...document.querySelectorAll('div[dir="auto"]')].find((e) => /^(● )?Not Checked In$/i.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0); if (!w || !p) return null; return {wRight: Math.round(w.getBoundingClientRect().right), pillLeft: Math.round(p.getBoundingClientRect().left)}; });
  check(!!wx && wx.wRight <= wx.pillLeft, `the weather isn't covered by the Not Checked In badge (${JSON.stringify(wx)})`);
  await page.screenshot({path: path.join(SHOTS, 'project-laptop.png')});

  await page.getByText('HUB', {exact: true}).filter({visible: true}).last().click(); await page.waitForTimeout(5000);
  const u = new URL(page.url());
  t = await body();
  check(u.pathname === '/pm/hub' && u.searchParams.get('site') === S1, `the HUB row opens the HUB for this project (${u.pathname}${u.search})`);
  check(/Chase scaffold/.test(t) && !/Order Cleveland skip/.test(t), 'only this project\'s to-dos');
  await page.screenshot({path: path.join(SHOTS, 'project-hub-laptop.png')});
  await ctx.close();

  // An operative keeps the job's Inbox.
  const o = await makeContext(browser, 'operative', [], {viewport: {width: 1366, height: 900}});
  require('./seeds/world')(o.db);
  Object.assign(o.db.profiles.find((p) => p.id === 'me'), {howto_dismissed: ['*']});
  if (!o.db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) o.db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  const op = await o.ctx.newPage(); op.on('pageerror', (e) => errs.push(e.message));
  await signIn(op);
  await op.goto(`${B}/sites/${S1}`); await op.waitForTimeout(6000);
  const om = await menuText(op);
  const oat = om.indexOf('THIS PROJECT');
  check(oat < 0 || om.slice(oat).includes('Inbox'), `an operative keeps the job's Inbox (${om.slice(Math.max(0, oat), oat + 10).join(' | ')})`);
  await o.ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
