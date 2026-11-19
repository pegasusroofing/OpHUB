// HR holiday calendar (Andy, 19 Nov 2026: "can we also have the hr calendar on laptop a little deeper for the cells
// also move the calender, requests and settings into a tab style please (only for the admin)"). On a laptop the days
// are deeper; on a phone they stay as they were; an admin gets Calendar / Requests / Settings as tabs.
// Fake database. node holidays19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, dev] of [[1366, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    seed(db); Object.assign(db.profiles[0], {role: 'admin', howto_dismissed: ['*']});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    await page.goto(`${B}/pm/hr/holidays`); await page.waitForTimeout(5000);
    const tabs = await page.getByRole('tab').allInnerTexts();
    check(['Calendar', 'Requests', 'Settings'].every((x) => tabs.some((t) => t.startsWith(x))), `${dev}: Calendar, Requests and Settings are tabs (${tabs.join(' | ')})`);
    // The height of a day in the month grid (the 15th's cell).
    const cellH = await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find((d) => d.childElementCount >= 1 && d.firstElementChild && d.firstElementChild.textContent === '15' && d.getBoundingClientRect().width < 260); return el ? Math.round(el.getBoundingClientRect().height) : 0; });
    check(dev === 'laptop' ? cellH >= 110 : cellH > 0 && cellH < 90, `${dev}: day cells ${dev === 'laptop' ? 'deeper' : 'as before'} (${cellH}px)`);
    await page.screenshot({path: path.join(__dirname, 'shots', `holidays19-${dev}.png`)});
    await page.getByRole('tab').filter({hasText: 'Settings'}).first().click(); await page.waitForTimeout(1200);
    check(/Holiday|Allowance|Limit/i.test(await page.locator('body').innerText()), `${dev}: the Settings tab opens`);
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
