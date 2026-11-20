// What a subcontractor's operative sees on a phone (Andy, 20 Nov 2026: "show me what they see"). An ordinary operative
// allocated to Pro Finish Decorators on a main contractor job. Screenshots of Home, the job, the bottom-bar items and Check
// In; prints where each tap lands. Fake database; nothing is sent. node subop-look.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const OUT = path.join(__dirname, 'shots', 'subop'); require('fs').mkdirSync(OUT, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {shot: true});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {name: 'Lee Painter', howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.subcontractor_companies = [{id: 'co1', org_id: me.org_id, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: '2026-09-01T09:00:00Z'}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: false}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => page.screenshot({path: path.join(OUT, `${n}.png`)});
  const where = () => new URL(page.url()).pathname.replace(S1, 'JOB');
  const say = async (what) => console.log(`${what} → ${where()} | ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160)}`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await shot('1-home'); await say('home');
  await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(5000); await shot('2-job'); await say('open the job');
  for (const [n, url] of [['3-checkin', `/sites/${S1}/checkin`], ['4-calendar', `/sites/${S1}/calendar`], ['5-hs', `/sites/${S1}/hs`], ['6-schedule', `/sites/${S1}/schedule`], ['7-inbox', '/inbox?tab=todo']]) {
    await page.goto(B + url); await page.waitForTimeout(4500); await shot(n); await say(n);
  }
  // The bottom bar's Check In.
  await page.goto(`${B}/home`); await page.waitForTimeout(4000);
  const ci = page.getByText('Check In', {exact: true}).last(); if (await ci.count()) { await ci.click(); await page.waitForTimeout(4000); await shot('8-bottom-checkin'); await say('bottom bar Check In'); }
  console.log('errors:', errs.slice(0, 3).join(' | ') || 'none');
  await browser.close();
})();
