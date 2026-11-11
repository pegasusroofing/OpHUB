// Andy's 11 Nov picks, clicked through on a phone against the fake database: the HUB's To Do tab (add with a tag, tick to
// finish), Make It A To Do from a job message and the Company Chat, the Schedule of Works ⋯ menus (move a section, move a
// task, Who Can See This), the home page's five days (a day opens Add To Calendar on that day) and the HUB button on a job.
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'andy11');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
  const O = db.organizations[0].id, now = new Date().toISOString();
  db.schedule_sections.push({id: 'sec2', site_id: S1, name: 'Flat roof', position: 2});
  db.schedule_tasks.find((x) => x.id === 't2').status = 'progress'; // the word live uses
  db.schedule_tasks.push({id: 't3', site_id: S1, section_id: null, name: 'Fit lead', status: 'todo', position: 3});
  Object.assign(db.messages.find((m) => m.id === 'ms1'), {audience: 'managers'});
  db.messages.push({id: 'ms2', org_id: O, site_id: S1, sender_id: 'o2', audience: 'single', recipient_id: 'me', body: 'Need more nails', kind: 'general', created_at: new Date(Date.now() - 3600000).toISOString()});
  db.company_chat = [{id: 'cc1', org_id: O, sender_id: 'o1', sender_name: 'Jake Morris', body: 'Skip is full', mentions: [], created_at: now}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const body = async () => page.locator('body').innerText();
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // Home: five working days; a day opens Add To Calendar on that day.
  const days = page.locator('[aria-label$="Tap to add."] >> visible=true');
  check(await days.count() === 5, `home shows five days (${await days.count()})`);
  await days.nth(1).click(); await page.waitForTimeout(3000);
  const u = new URL(page.url());
  check(u.pathname === '/pm/calendar' && /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('date') || ''), 'a day opens the calendar for that day');
  check(/Add To Calendar/.test(await body()) && await page.locator(`text=${new Date(u.searchParams.get('date') + 'T00:00:00').getDate()}`).count() > 0, 'with Add To Calendar open');
  await page.screenshot({path: path.join(SHOTS, 'picks-cal-add.png')});

  // HUB: To Do first.
  await page.goto(B + '/pm/hub'); await page.waitForTimeout(4500);
  let t = await body();
  check(/Chase scaffold/.test(t) && /\+ Add A To Do/.test(t), 'HUB opens on To Do, with the seeded to-do');
  check(/Due /.test(t) && /@Andy|@/.test(t), 'row shows the due date and who');
  // Add one, tagging Jake.
  await page.getByText('+ Add A To Do', {exact: true}).click(); await page.waitForTimeout(800);
  await vis('textarea').fill('Order more lead');
  await page.getByText('🏷 Tag People', {exact: true}).click(); await page.waitForTimeout(600);
  await vis('[aria-label="Jake Morris"]').click(); await page.getByText('Done', {exact: true}).last().click(); await page.waitForTimeout(500);
  check(/Tagged: Jake Morris/.test(await body()), 'Jake tagged in the pop-up');
  await page.getByText('Add To Do', {exact: true}).click(); await page.waitForTimeout(2500);
  const nt = db.todos.find((x) => x.text === 'Order more lead');
  check(!!nt && nt.assigned_to === 'o1' && (nt.tagged || []).includes('o1') && nt.created_by === 'me', 'saved, assigned to Jake and tagged');
  const tell = db.messages.find((m) => m.kind === 'todo_tagged' && m.recipient_id === 'o1');
  check(!!tell && tell.audience === 'single' && /Order more lead/.test(tell.body), 'Jake gets a message (to him only)');
  t = await body(); if (!/@Jake/.test(t)) console.log('  screen: ' + t.slice(0, 600).split(String.fromCharCode(10)).join(' | '));
  check(/Order more lead/.test(t) && /@Jake/.test(t), 'new to-do shows with @Jake');
  await page.screenshot({path: path.join(SHOTS, 'picks-hub-todo.png')});
  // Tick the seeded one.
  await vis('[aria-label="Done: Chase scaffold"]').click(); await page.waitForTimeout(2000);
  check(db.todos.find((x) => x.id === 'td1').done === true, 'tick marks it done');
  check(!/Chase scaffold/.test(await body()), 'and it leaves the list');

  // Company Chat: Make It A To Do.
  await page.getByRole('tab', {name: /^Company Chat/}).first().click(); await page.waitForTimeout(2500);
  await vis('[aria-label="Make It A To Do"]').click(); await page.waitForTimeout(800);
  check(/Make It A To Do/.test(await body()) && (await page.locator('textarea >> visible=true').last().inputValue()) === 'Skip is full', 'chat: pop-up starts with the message');
  await page.getByText('Add To Do', {exact: true}).click(); await page.waitForTimeout(2500);
  const ct = db.todos.find((x) => x.text === 'Skip is full');
  check(!!ct && ct.message_id === 'cc1', 'chat: to-do saved, linked to the message');

  // A job's messages: Make It A To Do.
  await page.goto(B + `/sites/${S1}/messages`); await page.waitForTimeout(4000);
  await vis('[aria-label="Make It A To Do"]').click(); await page.waitForTimeout(800);
  check((await page.locator('textarea >> visible=true').last().inputValue()) === 'Scaffold is up', 'job message: pop-up starts with the message');
  await page.getByText('Add To Do', {exact: true}).click(); await page.waitForTimeout(2500);
  const mt = db.todos.find((x) => x.text === 'Scaffold is up');
  check(!!mt && mt.message_id === 'ms1' && mt.site_id === S1, 'job message: to-do saved on the job, linked to the message');
  const n2 = page.locator('[aria-label="Make It A To Do"] >> visible=true');
  check(await n2.count() === 2, `a message to you alone has Make It A To Do too (${await n2.count()})`);
  await page.goto(B + '/pm/hub'); await page.waitForTimeout(4000);
  check(/From A Message/.test(await body()), 'HUB row says From A Message');

  // Schedule of Works.
  await page.goto(B + `/sites/${S1}/schedule`); await page.waitForTimeout(4500);
  t = await body();
  check(/Strip roof/.test(t), 'sections start open (task inside shows)');
  check(await page.locator('[aria-label="More: Main roof"] >> visible=true').count() === 1, 'section has its ⋯');
  await vis('[aria-label="More: Main roof"]').click(); await page.waitForTimeout(600);
  t = await body();
  check(/Who Can See This/.test(t) && /Move Up/.test(t) && /Move Down/.test(t), 'section ⋯: Who Can See This, Move Up, Move Down');
  await page.getByText('▼ Move Down', {exact: true}).click(); await page.waitForTimeout(2500);
  const p1 = db.schedule_sections.find((x) => x.id === 'sec1').position, p2 = db.schedule_sections.find((x) => x.id === 'sec2').position;
  check(p1 > p2, `Move Down swaps the sections (${p1} vs ${p2})`);
  t = await body();
  check(t.indexOf('Flat roof') > -1 && t.indexOf('Flat roof') < t.indexOf('Main roof'), 'and the page shows the new order');
  await vis('[aria-label="More: Fit lead"]').click(); await page.waitForTimeout(600);
  await page.getByText('▲ Move Up', {exact: true}).click(); await page.waitForTimeout(2500);
  const tp = db.schedule_tasks.find((x) => x.id === 't3').position, bp = db.schedule_tasks.find((x) => x.id === 't2').position;
  check(tp < bp, `task Move Up (${tp} vs ${bp})`);
  await vis('[aria-label="More: Strip roof"]').click(); await page.waitForTimeout(600);
  await page.getByText('🔒 Who Can See This', {exact: true}).click(); await page.waitForTimeout(800);
  check(/follows its section/.test(await body()), 'a task in a section points to the section for Who Can See This');
  await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(400);
  await vis('[aria-label="More: Fit battens"]').click(); await page.waitForTimeout(600);
  await page.getByText('🔒 Who Can See This', {exact: true}).click(); await page.waitForTimeout(800);
  check(/Only The People Ticked/.test(await body()) && !/follows its section/.test(await body()), 'a loose task opens its own Who Can See This');
  await page.screenshot({path: path.join(SHOTS, 'picks-sow.png')});

  // The bottom bar on a job: HUB for a manager.
  await page.goto(B + `/sites/${S1}`); await page.waitForTimeout(4000);
  check(await page.locator('[aria-label="HUB"] >> visible=true').count() === 1, 'job bar has HUB');
  await vis('[aria-label="HUB"]').click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/pm/hub', 'HUB opens the HUB page');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
