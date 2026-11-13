// Andy's phone-view list (31 Oct 2026): taskbar, header, back button, Schedule of Works menu, Drawings, HUB, Calendar, To Do. Fake database.
const {chromium, makeContext, S1} = require('./harness');
const B = 'http://localhost:8081', shot = (p, n) => p.screenshot({path: `shots/a38-${n}.png`});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id, me = db.profiles[0].id;
  db.site_calendar_events = [{id: 'ev1', site_id: S1, org_id: org, title: 'Site visit', event_date: new Date().toISOString().slice(0, 10), is_private: true, created_by: me, created_at: new Date().toISOString()}];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  const say = (k, v) => console.log(k.padEnd(34), v);
  const go = async (u, ms = 5000) => { await page.goto(B + u); await page.waitForTimeout(ms); };
  const text = () => page.locator('body').innerText();
  await go('/login', 6000); await shot(page, 'login');
  say('login title colour', await page.getByText('OpHUB', {exact: true}).first().evaluate((e) => getComputedStyle(e).color));
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await go('/sites'); await shot(page, 'projects');
  let t = await text();
  say('projects bar', ['Home', 'Deliveries', 'HUB', 'Calendar'].map((x) => `${x}:${t.includes(x)}`).join(' '));
  say('filters in one drop-down', /All \(\d+\) ▼/.test(t) && !/Upcoming \(\d+\)/.test(t));
  say('no + New Project in the page', !t.includes('+ New Project'));
  say('page width', await page.evaluate(() => `${document.documentElement.scrollWidth}/${innerWidth}`));
  await page.getByText(/All \(\d+\) ▼/).click(); await page.waitForTimeout(800); await shot(page, 'projects-filter');
  await page.getByText(/^Live \(\d+\)/).last().click(); await page.waitForTimeout(800);

  await go(`/sites/${S1}`); await shot(page, 'job');
  t = await text();
  say('job bar', ['Deliveries', 'Check In', 'Inbox', 'Settings'].map((x) => `${x}:${t.includes(x)}`).join(' '));
  say('HUB tile', t.includes('HUB') && !/\bMessages\b/.test(t));

  await go(`/sites/${S1}/schedule`); await shot(page, 'sow');
  await page.getByLabel('Section', {exact: true}).first().click(); await page.waitForTimeout(800); await shot(page, 'sow-add'); // + Section ▾ since 11 Nov
  t = await text();
  say('SOW add has 3', ['Add Section', 'Import schedule', 'Add Variation'].every((x) => t.includes(x)) && !t.includes('From Library'));
  await page.getByText('Add Section').last().click(); await page.waitForTimeout(800);
  t = await text(); say('Add Section then new or library', t.includes('New section') && t.includes('From the library'));
  await page.getByText('New section').last().click(); await page.waitForTimeout(800); await shot(page, 'sow-section');
  const fs1 = await page.locator('input:visible').last().evaluate((e) => getComputedStyle(e).fontSize);
  say('box text size (16 stops zoom)', fs1);
  await page.locator('input:visible').last().fill('Roof Level 9'); await page.getByText('Add section').last().click(); await page.waitForTimeout(2000);
  say('section saved', db.schedule_sections.some((s) => s.name === 'Roof Level 9'));
  await shot(page, 'sow-after');
  say('add task button style', await page.getByText('+ ADD TASK').count());

  // Trail and back button.
  db.drawing_folders = [...(db.drawing_folders || []), {id: 'fx1', site_id: S1, org_id: org, name: 'Roof Plans', parent_id: null, position: 0}];
  await go(`/sites/${S1}/drawings`); await shot(page, 'drawings');
  await page.getByText('Roof Plans').first().click(); await page.waitForTimeout(2500);
  await page.locator('[aria-label="HUB"] >> visible=true').click(); /* a manager's job bar has HUB since 11 Nov */ await page.waitForTimeout(3000);
  t = await text(); await shot(page, 'hub');
  say('top of HUB page', t.split('\n').filter(Boolean).slice(0, 7).join(' | ').slice(0, 150));
  say('trail still says Drawings', /Drawings|Roof Plans/.test(t.split('\n').slice(0, 12).join(' ')));
  await page.locator('[aria-label="Back"] >> visible=true').last().click({force: true}); await page.waitForTimeout(1500);
  say('back from HUB goes to', page.url().replace(B, '').replace(S1, 'S1'));
  await page.locator('[aria-label="Back"] >> visible=true').last().click({force: true}); await page.waitForTimeout(1500);
  say('back from job goes to', page.url().replace(B, '').replace(S1, 'S1'));


  // Messages.
  await go(`/sites/${S1}/messages`); t = await text();
  say('HUB title, drop-down filter', t.includes('HUB') && t.includes('From Team ▼'));
  const box = page.locator('textarea:visible').first();
  await box.fill('Please check this @'); await page.waitForTimeout(800); await shot(page, 'hub-mention');
  const pick = page.getByText(/^@/).first(); say('@ lists people', await pick.count());
  if (await pick.count()) await pick.click();
  await page.getByText('Send', {exact: true}).first().click(); await page.waitForTimeout(800); await shot(page, 'hub-send');
  // Who it goes to is a drop-down beside Send now (Andy, 4 Nov 2026): Site Operatives by default, no pop-up.
  await page.waitForTimeout(1500); t = await text(); say('send goes straight to site operatives', !t.includes('All company operatives'));
  say('message saved', (db.messages || []).filter((m) => /Please check/.test(m.body)).length);

  // Calendar.
  await go(`/sites/${S1}/calendar`); await shot(page, 'cal'); t = await text();
  say('saved date shows', t.includes('Site visit'));
  await page.getByText('+', {exact: true}).first().click(); await page.waitForTimeout(800); await shot(page, 'cal-add');
  await page.getByText('Everyone on the job').first().click(); await page.waitForTimeout(500);
  await page.getByText(/Operatives$/).first().click(); await page.waitForTimeout(400); await shot(page, 'cal-vis');
  await page.locator('input:visible').first().fill('Managers meeting');
  await page.getByText('Add Key Date').last().click(); await page.waitForTimeout(2000);
  const ev = (db.site_calendar_events || []).find((e) => e.title === 'Managers meeting');
  say('visibility saved', ev ? JSON.stringify(ev.visible_roles) : 'NOT SAVED');

  // To Do and Drawings file menu.
  db.todos = db.todos || [];
  await go(`/sites/${S1}/todos`); await shot(page, 'todo');
  console.log('errors', errs.length ? [...new Set(errs)].join(' / ').slice(0, 700) : 'none');
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('STOPPED', e.message.slice(0, 400)); process.exit(1); });
