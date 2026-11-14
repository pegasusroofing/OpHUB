// The all-projects calendar on a laptop (Andy, 14 Nov 2026): the chosen day's panel the full height of the month, with
// "+ Add To <day>" at its foot opening Add To Calendar on that day; the filter buttons as white pills (Filter By PM ▾,
// not small capitals) and the Month View switch the same size. node calendar14-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1440, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(B + '/pm/calendar'); await page.waitForTimeout(5000);
  const t = await page.locator('body').innerText();
  check(/Filter By PM ▾/.test(t) && /Filter By Site ▾/.test(t) && /Driver Diary/.test(t) && !/FILTER BY PM/.test(t), 'filters: Filter By PM ▾ / Filter By Site ▾ / Driver Diary, not small capitals');
  const h = await page.evaluate(() => {
    const ht = (re) => { const d = [...document.querySelectorAll('div')].find((x) => x.childElementCount === 0 && re.test(x.innerText)); return d ? Math.round(d.parentElement.getBoundingClientRect().height) : 0; };
    return [ht(/^Filter By PM ▾$/), ht(/^Filter By Site ▾$/), ht(/^View ▾$/)];
  });
  check(h[0] >= 37 && h.every((x) => Math.abs(x - h[0]) < 1), `the filters and the View switch are the same size (${h.join(' / ')})`);
  const add = page.getByText(/^\+ Add To (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) /).filter({visible: true}).first();
  check(await add.count() === 1, `the day panel has + Add at its foot (${await add.innerText().catch(() => '')})`);
  const ab = await add.boundingBox(); const grid = await page.getByText(/^sun$/i).filter({visible: true}).first().boundingBox();
  check(!!ab && !!grid && ab.y > grid.y + 300, 'and it sits at the bottom of the panel, level with the month');
  await page.screenshot({path: path.join(SHOTS, 'laptop-calendar.png')});
  await add.click(); await page.waitForTimeout(1000);
  check(/Add To Calendar/.test(await page.locator('body').innerText()), 'it opens Add To Calendar for that day');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
