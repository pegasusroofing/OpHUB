// Finance › Projects' Value Of Works bar on an iPhone (Andy, 17 Nov 2026): first "the footer bar sits below screen"
// (under the home line), then "This bar is too big needs reducing slightly". The test browser is made to report an
// iPhone's 34px home-line space; the bar must clear the line (its words at least 20px up from the bottom of the
// screen) and be no taller than about 46px all in (it was about 66px with the full 34px added).
// node footbar17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'footbar17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  // An iPhone's home line: the safe-area reader sees 34px at the bottom.
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'div[style*="safe-area-inset-bottom"]{padding-bottom:34px !important}'; document.head.appendChild(s); }); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(B + '/fin/jobs'); await page.waitForTimeout(5000);
  const m = await page.evaluate(() => {
    const f = document.querySelector('[aria-label="Value of works"]'); if (!f) return null;
    const h = f.parentElement.getBoundingClientRect(), words = [...f.querySelectorAll('div[dir="auto"]')].map((e) => e.getBoundingClientRect());
    return {holder: Math.round(h.height), holderBottom: Math.round(h.bottom), vh: innerHeight, wordsUp: Math.round(innerHeight - Math.max(...words.map((w) => w.bottom))), pad: getComputedStyle(f.parentElement).paddingBottom};
  });
  check(!!m && m.holderBottom === m.vh, `the bar sits on the bottom of the screen (${JSON.stringify(m)})`);
  check(!!m && m.wordsUp >= 20, `its words clear the iPhone's home line (${m && m.wordsUp}px up)`);
  check(!!m && m.holder <= 48, `the bar is shorter: ${m && m.holder}px all in (was about 66)`);
  await page.screenshot({path: path.join(SHOTS, 'projects-iphone.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
