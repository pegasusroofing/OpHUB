// Finance › Projects on an iPhone (Andy, 17 Nov 2026): first "the footer bar sits below screen", then "This bar is too
// big needs reducing slightly", then "In fact remove the footer in projects in finance". So no Value Of Works bar; the
// list runs to the bottom and its last project scrolls fully into view. The test browser reports an iPhone's 34px
// home-line space. (Other Finance pages' foot bars, such as Reports' Export, still sit above the home line, using only
// as much of that space as clears it.) node footbar17-check.js
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
  await page.goto(B + '/fin/jobs?st=all'); await page.waitForTimeout(5000);
  check(await page.locator('[aria-label="Value of works"]').count() === 0 && !/Value Of Works/.test(await page.evaluate(() => document.body.innerText)), 'no Value Of Works bar at the foot');
  await page.mouse.move(195, 600); await page.mouse.wheel(0, 4000); await page.waitForTimeout(800);
  const last = await page.evaluate(() => { const rows = [...document.querySelectorAll('[role="button"]')].filter((b) => /^J\d+|^SBX-/.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 300); const r = rows.length ? rows[rows.length - 1].getBoundingClientRect() : null; return r ? {bottom: Math.round(r.bottom), vh: innerHeight} : null; });
  check(!!last && last.bottom <= last.vh, `the last project scrolls fully into view (${JSON.stringify(last)})`);
  await page.screenshot({path: path.join(SHOTS, 'projects-iphone.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
