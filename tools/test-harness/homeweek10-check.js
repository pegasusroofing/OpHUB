// Home's Next 5 Days swipes to the 5 working days after (Andy, 17 Nov 2026: "Can the next 5 days on calendar be swipe
// able for 10 days? Keep text as it is but let me see 5 more days on a swipe"). The heading stays Next 5 Days; a swipe
// moves a whole five; two dots under it say which five and, tapped, go there (the laptop's way). Items on the second
// five open as on the first. Phone, then laptop. Fake database. node homeweek10-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'homeweek10');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = (() => { const out = []; const d = new Date(); while (out.length < 10) { if (d.getDay() % 6 !== 0) out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; })();
const long = (ds) => new Date(`${ds}T00:00:00`).toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', howto_dismissed: ['*']});
  const O = db.organizations[0].id, now = new Date().toISOString();
  db.site_calendar_events = [
    {id: 'ev1', site_id: S1, org_id: O, title: 'Scaffold up', event_date: days[0], created_by: 'me', created_at: now},
    {id: 'ev7', site_id: S1, org_id: O, title: 'Roof inspection', event_date: days[6], created_by: 'me', created_at: now},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (/cannot contain a nested|cannot be a descendant/.test(m.text())) errs.push(m.text().slice(0, 90)); });
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const q = () => new URL(page.url()).searchParams;
  // Which days are on screen (their box fully inside the row), and the dots' colours.
  const state = () => page.evaluate(() => {
    const row = document.querySelector('[data-testid="home-week"]'); const rb = row.getBoundingClientRect();
    const boxes = [...row.querySelectorAll('[aria-label^="+ Add to "]')].map((e) => ({l: e.getAttribute('aria-label').slice(9), r: e.parentElement.getBoundingClientRect()}));
    const shown = boxes.filter((b) => b.r.left >= rb.left - 1 && b.r.right <= rb.right + 1).map((b) => b.l);
    const dots = ['Show the next 5 days', 'Show the 5 days after'].map((l) => { const d = document.querySelector(`[aria-label="${l}"]`); return d ? getComputedStyle(d).backgroundColor : ''; });
    const head = [...document.querySelectorAll('div[dir="auto"]')].some((e) => e.textContent.trim() === 'Next 5 Days' && e.getBoundingClientRect().width > 0);
    return {n: boxes.length, shown, dots, head, widths: [...new Set(boxes.map((b) => Math.round(b.r.width)))]};
  });
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  for (const [name, vp] of [['phone', {width: 390, height: 844}], ['laptop', {width: 1300, height: 900}]]) {
    await page.setViewportSize(vp);
    await page.goto(B + '/home'); await page.waitForTimeout(5000);
    await vis('[data-testid="home-week"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    let s = await state();
    check(s.n === 10 && s.widths.length === 1, `${name}: ten days, all the same width (${s.n}; ${s.widths.join(',')}px)`);
    check(JSON.stringify(s.shown) === JSON.stringify(days.slice(0, 5).map(long)), `${name}: the first five showing (${s.shown.join(' | ')})`);
    const marked = s.dots[0];
    check(s.head && s.dots[0] !== s.dots[1], `${name}: still headed Next 5 Days, two dots with the first marked`);
    await page.screenshot({path: path.join(SHOTS, `first-${name}.png`), clip: await (async () => { const b = await vis('[data-testid="home-week"]').boundingBox(); return {x: b.x - 4, y: b.y - 44, width: b.width + 8, height: b.height + 70}; })()});

    if (name === 'phone') {
      // A swipe: a whole five moves, and it stops there.
      const b = await vis('[data-testid="home-week"]').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(260, 0); await page.waitForTimeout(1500);
    } else {
      await vis('[aria-label="Show the 5 days after"]').click(); await page.waitForTimeout(1500);
    }
    s = await state();
    check(JSON.stringify(s.shown) === JSON.stringify(days.slice(5, 10).map(long)), `${name}: ${name === 'phone' ? 'a swipe' : 'the second dot'} shows the next five after (${s.shown.join(' | ')})`);
    check(s.head && s.dots[1] === marked && s.dots[0] !== marked, `${name}: heading unchanged, the second dot marked`);
    await page.screenshot({path: path.join(SHOTS, `second-${name}.png`), clip: await (async () => { const bb = await vis('[data-testid="home-week"]').boundingBox(); return {x: bb.x - 4, y: bb.y - 44, width: bb.width + 8, height: bb.height + 70}; })()});

    // An item on the second five opens as on the first.
    await vis('[aria-label="Open Roof inspection"]').click(); await page.waitForTimeout(3500);
    check(q().get('date') === days[6] && q().get('open') === 'ev7', `${name}: an item in the second five opens on its day (${page.url().replace(B, '')})`);
    await page.goto(B + '/home'); await page.waitForTimeout(4500);
    await vis(`[aria-label="+ Add to ${long(days[0])}"]`).scrollIntoViewIfNeeded();
    if (name === 'laptop') {
      await vis('[aria-label="Show the 5 days after"]').click(); await page.waitForTimeout(1200);
      await vis('[aria-label="Show the next 5 days"]').click(); await page.waitForTimeout(1200);
      check(JSON.stringify((await state()).shown) === JSON.stringify(days.slice(0, 5).map(long)), `${name}: the first dot goes back`);
    }
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
