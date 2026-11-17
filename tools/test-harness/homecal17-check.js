// Home's Next 5 Days (Andy, 17 Nov 2026: "when there are items in there I'm clicking them but it's asking to add again.
// In the iPhone I can click the items in there as well as add"). Like the iPhone's calendar: tapping an item opens it
// (the calendar on that day with the item open, no Add pop-up); "+N More" opens that day; an application opens its job;
// the rest of the day box, or the + at its foot, still adds to that day. Phone, then laptop. Fake database.
// node homecal17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'homecal17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
// The app's own next five working days, in local time.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = (() => { const out = []; const d = new Date(); while (out.length < 5) { if (d.getDay() % 6 !== 0) out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; })();
const long = (ds) => new Date(`${ds}T00:00:00`).toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id, now = new Date().toISOString();
  // Three on the first day (so "+1 More" shows), one on the second, an application on the third.
  db.site_calendar_events = [
    {id: 'ev1', site_id: S1, org_id: O, title: 'Scaffold up', event_date: days[0], created_by: 'me', created_at: now},
    {id: 'ev2', site_id: S1, org_id: O, title: 'Roof strip', event_date: days[0], created_by: 'me', created_at: now},
    {id: 'ev3', site_id: S1, org_id: O, title: 'Skip swap', event_date: days[0], created_by: 'me', created_at: now},
    {id: 'ev4', site_id: S1, org_id: O, title: 'Client survey', event_date: days[1], created_by: 'me', created_at: now},
  ];
  global.__rpc = (name) => (name === 'site_application_dates' ? [{site_id: S1, app_dates: null, app_reminder_day: null, org_app_day: null, billing_type: 'application', applied_dates: [days[2]]}] : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (/cannot contain a nested|cannot be a descendant/.test(m.text())) errs.push(m.text().slice(0, 90)); });
  const body = () => page.evaluate(() => document.body.innerText);
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const addPop = async () => (await page.getByText('Add To Calendar', {exact: true}).filter({visible: true}).count()) > 0;
  const q = () => new URL(page.url()).searchParams;
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  for (const [name, vp] of [['phone', {width: 390, height: 844}], ['laptop', {width: 1300, height: 900}]]) {
    await page.setViewportSize(vp);
    await page.goto(B + '/home'); await page.waitForTimeout(4500);
    check(await vis('[aria-label="Open Scaffold up"]').count() === 1 && await vis('[aria-label="Open Client survey"]').count() === 1, `${name}: each item is its own button`);
    check(await vis(`[aria-label="See all 3 on ${long(days[0])}"]`).count() === 1, `${name}: "+1 More" on the busy day`);
    const plus = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="+ Add to "]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
      const box = e.parentElement.getBoundingClientRect(), r = e.getBoundingClientRect();
      return e.textContent.trim() === '+' && Math.abs(r.bottom - box.bottom) < 3;
    }));
    // Ten days since 17 Nov 2026 (the second five a swipe away).
    check(plus.length === 10 && plus.every(Boolean), `${name}: a + at the foot of every day (${plus.join(',')})`);
    check(await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Open "], [aria-label^="Add to "], [aria-label^="+ Add to "], [aria-label^="See all "]')]
      .filter((e) => e.parentElement.closest('button, [role="button"]')).length) === 0, `${name}: no button inside another`);
    await page.evaluate(() => { const h = [...document.querySelectorAll('div[dir="auto"]')].find((e) => e.textContent.trim() === 'Next 5 Days' && e.getBoundingClientRect().width > 0); h.scrollIntoView({block: 'start'}); window.scrollBy(0, -12); });
    await page.waitForTimeout(400);
    const hw = await page.getByText('Next 5 Days', {exact: true}).first().boundingBox();
    await page.screenshot({path: path.join(SHOTS, `home-${name}.png`), clip: {x: name === 'laptop' ? 248 : 0, y: Math.max(0, hw.y - 12), width: name === 'laptop' ? vp.width - 248 : vp.width, height: 200}});

    // Tap an item: the calendar on that day with it open, no Add pop-up.
    await vis('[aria-label="Open Client survey"]').click(); await page.waitForTimeout(3500);
    let t = await body();
    check(new URL(page.url()).pathname === '/pm/calendar' && q().get('date') === days[1] && q().get('open') === 'ev4', `${name}: tapping an item opens the calendar on that day (${page.url().replace(B, '')})`);
    check(!(await addPop()), `${name}: no Add To Calendar pop-up`);
    check(/Client survey ›/.test(t) && /Project: /.test(t) && /Added by/.test(t), `${name}: the item is open with its details`);
    check(new RegExp(`${long(days[1])} · 1 booked`).test(t), `${name}: that day is the one chosen`);
    await page.screenshot({path: path.join(SHOTS, `item-open-${name}.png`)});

    // "+1 More": that day, nothing open, no pop-up.
    await page.goto(B + '/home'); await page.waitForTimeout(4000);
    await vis(`[aria-label="See all 3 on ${long(days[0])}"]`).click(); await page.waitForTimeout(3500);
    t = await body();
    check(q().get('date') === days[0] && !q().get('add') && !(await addPop()) && new RegExp(`${long(days[0])} · 3 booked`).test(t) && /Skip swap/.test(t), `${name}: "+1 More" opens that day with all three`);

    // An application opens its job.
    await page.goto(B + '/home'); await page.waitForTimeout(4000);
    const app = vis('[aria-label^="Open 💷"]');
    check(await app.count() === 1, `${name}: the application is its own button too`);
    if (await app.count()) {
      await app.click(); await page.waitForTimeout(3500);
      const p = new URL(page.url()).pathname;
      check(p === `/fin/job/${S1}` || p === `/sites/${S1}/calendar`, `${name}: the application opens its job (${p})`);
    }

    // The + (or empty part of the box) still adds to that day.
    await page.goto(B + '/home'); await page.waitForTimeout(4000);
    await vis(`[aria-label="+ Add to ${long(days[0])}"]`).click(); await page.waitForTimeout(3500);
    check(q().get('date') === days[0] && q().get('add') === '1' && await addPop(), `${name}: the + at the foot of a busy day adds to it`);
    await page.screenshot({path: path.join(SHOTS, `add-${name}.png`)});
    await page.goto(B + '/home'); await page.waitForTimeout(4000);
    await vis(`[aria-label="Add to ${long(days[1])}"]`).click(); await page.waitForTimeout(3500);
    check(q().get('date') === days[1] && q().get('add') === '1' && await addPop(), `${name}: tapping a day's name adds to that day`);
    await page.goto(B + '/home'); await page.waitForTimeout(4000);
    const empty = vis(`[aria-label="+ Add to ${long(days[3])}"]`); const eb = await empty.boundingBox(), db3 = await vis(`[aria-label="Add to ${long(days[3])}"]`).boundingBox();
    check(!!eb && !!db3 && eb.height >= 40, `${name}: on an empty day, nearly the whole box is the + (${eb && Math.round(eb.height)}px)`);
    await empty.click({position: {x: eb.width / 2, y: 6}}); await page.waitForTimeout(3500);
    check(q().get('date') === days[3] && await addPop(), `${name}: an empty day adds to that day`);
  }

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
