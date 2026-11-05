// Operatives' bottom bar as the old app (Andy, 5 Nov 2026), fake database only, phone size:
// none on Home, Settings, Messages & tasks or My Dashboard; Outstanding · Inbox · My Dashboard · Settings on Projects;
// the job bar (Home, SOW, Check In, Inbox, Settings) on a job.
// node opbar-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); me.role = 'operative'; me.howto_dismissed = ['*']; me.signature_path = 'sig/me.png';
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sa-me', site_id: S1, user_id: 'me'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  // The bottom bar's buttons: the labels in the last 90px of the screen.
  const bar = () => page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.childElementCount === 0 && e.textContent.trim() && e.getBoundingClientRect().top > window.innerHeight - 90 && e.getBoundingClientRect().bottom <= window.innerHeight + 2).map((e) => e.textContent.trim()).join(' · '));
  for (const [name, url] of [['Home', '/home'], ['Settings', '/account'], ['Messages & tasks', '/inbox'], ['My Dashboard', '/dashboard']]) {
    await page.goto(B + url); await page.waitForTimeout(3500);
    const b = await bar();
    check(!/Outstanding|My Dashboard · Settings|Home · Projects/.test(b), `no bar on ${name} (${b || 'none'})`);
  }
  await page.goto(B + '/sites'); await page.waitForTimeout(4000);
  let b = await bar();
  check(/Outstanding/.test(b) && /Inbox/.test(b) && /My Dashboard/.test(b) && /Settings/.test(b) && !/Projects/.test(b), `Projects bar: ${b}`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'opbar-projects.png')});
  await page.getByLabel('Outstanding').click(); await page.waitForTimeout(2500);
  check(/\/inbox/.test(page.url()), 'Outstanding opens Messages & tasks');
  await page.goto(B + '/sites/' + S1); await page.waitForTimeout(4500);
  b = await bar();
  check(/SOW/.test(b) && /Check In/.test(b) && /Inbox/.test(b) && /Settings/.test(b), `job bar: ${b}`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'opbar-job.png')});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
