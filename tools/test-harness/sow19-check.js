// Schedule of Works (Andy, 19 Nov 2026):
// - photos on a task still To Commence ask "Pre-Start or In Progress?"; In Progress puts them in In Progress and moves
//   the task to In Progress, Pre-Start keeps them as pre-start photos;
// - "0 Of 2 Tasks Done" and Export sit at the end of the page, not stuck to the bottom of the screen;
// - "Site condition" is now "Project Completion", with smaller rows.
// An operative on a phone. Fake database. node sow19-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const photo = path.join(__dirname, 'shots', 'samples', 'site-photo.jpg');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.rams_docs = []; db.coshh_docs = []; db.toolbox_talks = [];
  db.schedule_tasks.push({id: 't3', site_id: S1, section_id: null, name: 'Fit lead', status: 'todo', position: 3});
  db.schedule_photos = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(`${B}/sites/${S1}/schedule`); await page.waitForTimeout(5000);
  const body = () => page.evaluate(() => document.body.innerText);
  let t = await body();
  check(/Project Completion/i.test(t) && !/Site condition/i.test(t), 'the card is Project Completion, not Site condition');
  const foot = await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find((d) => /Tasks Done$/.test(d.innerText || '') && d.children.length === 0) || [...document.querySelectorAll('div')].reverse().find((d) => /Tasks Done/.test(d.innerText || '')); let bar = el; while (bar && getComputedStyle(bar).position !== 'sticky' && !/Export/.test(bar.innerText || '')) bar = bar.parentElement; return bar ? getComputedStyle(bar).position : 'none'; });
  check(foot !== 'sticky' && foot !== 'none', `Tasks Done and Export are at the end of the page, not stuck to the screen (${foot})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'sow19-top.png')});
  const addOn = (name) => page.locator('div').filter({hasText: new RegExp('^' + name)}).filter({has: page.locator('[aria-label="Add pre-start photos"]')}).last().locator('[aria-label="Add pre-start photos"]');
  // To Commence, work has started: In Progress.
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 10000}), addOn('Fit lead').click()]);
  await fc.setFiles([photo]); await page.waitForTimeout(1500);
  t = await body();
  check(/Pre-Start Or In Progress\?/.test(t) && /Pre-Start Photos/.test(t) && /In Progress \(Work Has Started\)/.test(t), 'a To Commence task asks Pre-Start or In Progress');
  await page.screenshot({path: path.join(__dirname, 'shots', 'sow19-question.png')});
  await page.getByText(/^🔨 In Progress/).last().click(); await page.waitForTimeout(6000);
  const p3 = db.schedule_photos.filter((x) => x.task_id === 't3');
  const t3 = db.schedule_tasks.find((x) => x.id === 't3');
  check(p3.length === 1 && p3[0].stage === 'progress', `In Progress: the photo is an In Progress photo (${p3.map((x) => x.stage).join(',') || 'none'})`);
  check(t3.status === 'progress', `and the task moves to In Progress (${t3.status})`);
  // To Commence, not started: Pre-Start.
  const [fc2] = await Promise.all([page.waitForEvent('filechooser', {timeout: 10000}), addOn('Strip roof').click()]);
  await fc2.setFiles([photo]); await page.waitForTimeout(1500);
  await page.getByText(/^📷 Pre-Start Photos/).last().click(); await page.waitForTimeout(6000);
  const p1 = db.schedule_photos.filter((x) => x.task_id === 't1');
  check(p1.length === 1 && p1[0].stage === 'todo' && db.schedule_tasks.find((x) => x.id === 't1').status === 'todo', `Pre-Start: a pre-start photo, the task stays To Commence (${p1.map((x) => x.stage).join(',') || 'none'})`);
  await page.mouse.move(195, 500); for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(150); } await page.waitForTimeout(800);
  await page.screenshot({path: path.join(__dirname, 'shots', 'sow19-end.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
