// The Hub on a laptop (Andy, 14 Nov 2026: "i clicked into it to close an item from the to do, marked as complete and
// still in the hub. check all functions in the hub work"): a to-do closed from the Hub's tick, or on its project's To Do
// page, drops off the To Do and Projects tabs; + Add A To Do; the Site and Due filters; Projects, Finance, All and
// Company Chat; Toolbox Talks as often as the company admin set (Admin › Toolbox Talks Required); Finance only flags an
// application once its date has gone with none raised (the due dates are on the calendar). node hub14-check.js
const {chromium, makeContext, S1, S2} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  const org = db.organizations[0]; Object.assign(org, {has_pm: true, has_finance: true, tbt_every: '3months'});
  const O = org.id, now = new Date().toISOString();
  db.todos = [
    {id: 'td1', org_id: O, site_id: S1, text: 'Chase scaffold', done: false, date_required_by: day(3), created_by: 'me', assigned_to: 'me', tagged: [], created_at: now},
    {id: 'td2', org_id: O, site_id: S2, text: 'Order lead flashing', done: false, date_required_by: day(-2), created_by: 'me', assigned_to: 'me', tagged: [], created_at: now},
    {id: 'td3', org_id: O, site_id: null, text: 'Ring the bank', done: false, date_required_by: null, created_by: 'me', assigned_to: 'me', tagged: [], created_at: now},
  ];
  // Toolbox talks: Studley Rd had one completed last month; Cleveland Primary has never had one.
  const lastMonth = new Date(); lastMonth.setDate(1); lastMonth.setMonth(lastMonth.getMonth() - 1);
  db.toolbox_talks = [{id: 'tb1', site_id: S1, org_id: O, title: 'Ladders', storage_path: 't.pdf', status: 'completed', created_by: 'me', created_at: lastMonth.toISOString(), subcontractor_company_id: null}];
  // Applications: Studley Rd's date this month has gone with none raised; Cleveland's is later this month.
  const today = new Date().getDate();
  (db.job_finance || []).forEach((j) => { j.billing_type = 'application'; j.app_dates = null; j.app_reminder_day = j.site_id === S1 ? Math.max(1, today - 1) : 28; });
  db.messages = [{id: 'mm1', org_id: O, site_id: null, sender_id: 'o1', audience: 'single', recipient_id: 'me', kind: 'message', body: 'Can you call the client back?', related_id: null, parent_id: null, created_at: now}];
  db.message_reads = [];
  db.fin_applications = (db.fin_applications || []).filter((a) => !String(a.valuation_date || '').startsWith(day(0).slice(0, 7)));

  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const body = () => page.locator('body').innerText();
  const tabLabel = async (name) => (await page.getByRole('tab', {name: new RegExp('^' + name)}).first().getAttribute('aria-label')) || '';
  const tab = async (name) => { await page.getByRole('tab', {name: new RegExp('^' + name)}).first().click(); await page.waitForTimeout(900); };
  await page.goto(B + '/pm/hub'); await page.waitForTimeout(5000);

  // To Do: the three, ticking one off.
  let t = await body();
  check(/Chase scaffold/.test(t) && /Order lead flashing/.test(t) && /Ring the bank/.test(t), 'To Do lists my three to-dos');
  check(/To Do, 3$/.test(await tabLabel('To Do')), `To Do counts 3 (${await tabLabel('To Do')})`);
  await page.getByLabel('Done: Chase scaffold').click(); await page.waitForTimeout(2000);
  check(db.todos.find((x) => x.id === 'td1').done === true, 'ticking it saves it as done');
  check(!/Chase scaffold/.test(await body()), 'and it drops off the To Do list');
  await tab('Projects');
  check(!/Chase scaffold/.test(await body()), 'and off the Projects tab (its Task item)');

  // Closed on its project's To Do page, then back: gone (the bug Andy hit).
  await tab('To Do');
  await page.getByLabel('Order lead flashing', {exact: true}).click(); await page.waitForTimeout(3500);
  check(page.url().includes(`/sites/${S2}/todos`), 'tapping a to-do opens its project\'s To Do page');
  await page.getByText('Mark Complete', {exact: true}).first().click(); await page.waitForTimeout(2000);
  check(db.todos.find((x) => x.id === 'td2').done === true, 'Mark Complete there saves it');
  await page.locator('[aria-label="Back"] >> visible=true').first().click(); await page.waitForTimeout(3500);
  check(/\/pm\/hub/.test(page.url()), 'the app\'s back arrow goes back to the Hub (' + page.url().split('8081')[1] + ')');
  t = await body();
  check(!/Order lead flashing/.test(t), 'the to-do closed on its project page has gone from the Hub');
  check(/To Do, 1$/.test(await tabLabel('To Do')), `To Do now counts 1 (${await tabLabel('To Do')})`);
  await tab('Projects');
  check(!/Order lead flashing/.test(await body()), 'and from the Projects tab');

  // + Add A To Do.
  await tab('To Do');
  await page.getByText('+ Add A To Do', {exact: true}).click(); await page.waitForTimeout(1200);
  await page.locator('textarea >> visible=true').first().fill('Book skip for Monday');
  await page.getByText('Add To Do', {exact: true}).click(); await page.waitForTimeout(2500);
  check(db.todos.some((x) => x.text === 'Book skip for Monday' && x.created_by === 'me'), '+ Add A To Do saves it');
  check(/Book skip for Monday/.test(await body()), 'and it shows on the To Do tab');
  await page.screenshot({path: path.join(SHOTS, 'hub-todo.png')});

  // Filters: Due ▾ Overdue shows none of these; back to Any.
  check(/Due: Any ▾|Due: Any\s*▾/.test(await body()), 'the filters use ▾');
  await page.getByLabel('Due', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('Overdue', {exact: true}).last().click(); await page.waitForTimeout(800);
  t = await body();
  check(!/Ring the bank/.test(t) && !/Book skip for Monday/.test(t), 'Due: Overdue hides to-dos that aren\'t overdue');
  await page.getByLabel('Due', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('Any Time', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(/Ring the bank/.test(await body()), 'Due: Any Time shows them again');
  await page.getByLabel('Site', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('Studley Rd', {exact: true}).last().click(); await page.waitForTimeout(800);
  check(!/Ring the bank/.test(await body()), 'Site: Studley Rd hides to-dos with no project');
  await page.getByLabel('Site', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByText('All Sites', {exact: true}).last().click(); await page.waitForTimeout(800);

  // Projects: Toolbox Talks every 3 months — Studley Rd's last-month talk covers it; Cleveland has never had one.
  await tab('Projects');
  t = await body();
  check(/none ever completed/.test(t), 'Projects: Cleveland Primary — no Toolbox Talk ever completed');
  check(!/Toolbox Talk due for/.test(t) || (await page.getByText(/Toolbox Talk due for/).count()) === 0, 'Projects: no "due" for Studley Rd, as its talk last month covers the quarter');
  check(/Cracked tile|Open snag/.test(t), 'Projects: the open snag');
  await page.screenshot({path: path.join(SHOTS, 'hub-projects.png')});
  // Every month: Studley Rd needs one this month.
  org.tbt_every = 'month';
  await page.goto(B + '/pm/hub?tab=projects'); await page.waitForTimeout(5500);
  check(/Toolbox Talk due for this month/.test(await body()), 'with Every Month set, Studley Rd shows "Toolbox Talk due for this month"');
  await page.getByText('Open snag', {exact: true}).first().click(); await page.waitForTimeout(3000);
  check(page.url().includes('/snagging'), 'tapping the snag opens the snags');
  await page.goBack(); await page.waitForTimeout(3000);

  // Finance: only an application not raised by its date.
  await tab('Finance');
  t = await body();
  check(/Applications Not Raised By Their Date/i.test(t), 'Finance: Studley Rd\'s application not raised by its date');
  check(!/Applications Due This Month/i.test(t), 'Finance: no "Applications due this month"');
  await page.screenshot({path: path.join(SHOTS, 'hub-finance.png')});

  // All: everything, last tab, with a count; a message opened is marked read.
  await tab('All');
  t = await body();
  const all = await tabLabel('All');
  check(/All, \d+$/.test(all) && /Projects · /.test(t) && /Finance · /.test(t), `All shows Projects and Finance items with a count (${all})`);
  const msgs = page.getByText('Can you call the client back?', {exact: true});
  if (await msgs.count()) {
    await msgs.first().click(); await page.waitForTimeout(2500);
    check((db.message_reads || []).some((r) => r.message_id === 'mm1'), 'opening a message marks it read');
    await page.goto(B + '/pm/hub?tab=all'); await page.waitForTimeout(5000);
    check(!/Can you call the client back/.test(await body()), 'and it drops off');
  } else check(false, 'the message shows under All');

  // Company Chat.
  await tab('Company Chat'); await page.waitForTimeout(1500);
  check(await page.getByLabel('Message', {exact: true}).count() > 0, 'Company Chat opens with its message box');

  // Admin › Toolbox Talks Required.
  await page.goto(B + '/pm/admin?page=hs'); await page.waitForTimeout(4000);
  check(/Toolbox Talks Required/.test(await body()), 'Admin lists Toolbox Talks Required');
  await page.goto(B + '/pm/admin/tbtrule'); await page.waitForTimeout(4000);
  t = await body();
  check(/How Often Does Each Live Project Need A Toolbox Talk\?/.test(t) && /Every Month/.test(t) && /Due by the 7th of each month/.test(t), 'the admin page shows the current rule (Every Month)');
  await page.getByLabel('Toolbox Talks Required', {exact: true}).click(); await page.waitForTimeout(700);
  await page.getByText('Every 3 Months', {exact: true}).last().click(); await page.waitForTimeout(700);
  check(/January, April, July and October/.test(await body()), 'choosing Every 3 Months explains when it\'s due');
  await page.screenshot({path: path.join(SHOTS, 'admin-tbtrule.png')});
  await page.getByText('Save', {exact: true}).click(); await page.waitForTimeout(2500);
  check(org.tbt_every === '3months', `Save stores it on the company (${org.tbt_every})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
