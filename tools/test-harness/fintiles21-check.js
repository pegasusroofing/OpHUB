// Finance's figure tiles keep their colours (Andy, 21 Nov 2026: "Put the colours back in the tiles in finance, I liked that
// please exactly how it was"): a coloured tile has a tinted background, not white. Laptop and phone pictures in
// shots/fintiles21. node fintiles21-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'fintiles21'); require('fs').mkdirSync(SHOTS, {recursive: true});

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); try { require('./seeds/ex1')(db); } catch (e) { /* optional */ }
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  // The tiles' backgrounds: any that aren't white or see-through.
  const tinted = () => page.evaluate(() => [...document.querySelectorAll('[role="button"], button')].map((e) => getComputedStyle(e).backgroundColor)
    .filter((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgb(255, 255, 255)' && !/^rgb\((2[3-5]\d), \1, \1\)$/.test(c)));
  for (const [url, name] of [['/fin', 'finance-home'], [`/fin/job/${S1}`, 'job-overview']]) {
    await page.goto(B + url); await page.waitForTimeout(6000);
    const t = await tinted();
    check(t.length > 0, `${name}: coloured tiles (${[...new Set(t)].slice(0, 5).join(' · ')})`);
    await page.screenshot({path: path.join(SHOTS, `${name}-laptop.png`)});
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(B + `/fin/job/${S1}`); await page.waitForTimeout(6000);
  await page.screenshot({path: path.join(SHOTS, 'job-overview-phone.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
