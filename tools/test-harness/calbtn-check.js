// Home's Calendar button (Andy, 14 Nov 2026: "looks a bit cheap. I like position"): same place beside Next 5 Days,
// now a tile like the day boxes with the calendar icon, "Calendar" and an arrow, not a round "Calendar ›" pill.
// Touch phone, fake database. node calbtn-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['home', 'guide:closed'];
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  const btn = page.locator('[aria-label="Open the calendar"] >> visible=true').first();
  check(await btn.count() === 1, 'home: the Calendar button is there');
  const txt = (await btn.innerText()).trim();
  check(txt === 'Calendar', `it reads "Calendar" with no "›" typed in (${txt})`);
  check(await btn.locator('svg').count() === 2, 'it has the calendar icon and an arrow');
  const st = await btn.evaluate((el) => { const s = getComputedStyle(el); return {r: s.borderTopLeftRadius, h: el.getBoundingClientRect().height}; });
  check(st.r === '10px', `square-ish corners like the day boxes (${st.r})`);
  // Still beside "Next 5 Days", on the right.
  const head = await page.getByText('Next 5 Days', {exact: true}).first().boundingBox();
  const b = await btn.boundingBox();
  check(!!head && !!b && Math.abs((b.y + b.height / 2) - (head.y + head.height / 2)) < 6 && b.x > 200, 'same place: on the right, level with Next 5 Days');
  await btn.scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(SHOTS, 'home-calbtn.png'), clip: {x: 0, y: Math.max(0, b.y - 40), width: 390, height: 230}});
  await page.screenshot({path: path.join(SHOTS, 'home-calbtn-full.png')});
  await btn.click(); await page.waitForTimeout(2500);
  check(/\/pm\/calendar/.test(page.url()), 'tapping it opens the calendar');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
