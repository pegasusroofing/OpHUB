// Daily briefing issue for signing (4 Nov 2026), fake database only: no Completed / Edited lines; the Issue For Signing
// button signs it for the PM there and then (as RAMS), then shows the operatives' Tap to sign.
// node briefissue-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*']; me.signature_path = 'sig/me.png';
  require('./seeds/briefcmp')(db, S1);
  const bf = db.report_submissions.find((r) => r.id === 'bf1'); bf.issued_at = null; bf.issued_by = null;
  bf.answers._editHistory = [{at: '2026-11-04T08:10:00Z', by: 'me', byName: 'Andy Admin'}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/sites/' + S1 + '/hs/briefings/bf1'); await page.waitForTimeout(4500);
  const t = await page.evaluate(() => document.body.innerText);
  check(!/Completed \d/.test(t) && !/Edited \d/.test(t), 'no Completed / Edited lines');
  const btn = page.getByText('Issue For Signing', {exact: true}).first();
  check(await btn.count() > 0, 'Issue For Signing button shows');
  const bg = await btn.evaluate((el) => { let n = el; for (let i = 0; i < 5 && n; i++) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; n = n.parentElement; } return ''; });
  check(!!bg && bg !== 'rgb(255, 255, 255)', `button is filled with the company colour (${bg})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'brief-issue-before.png'), fullPage: true});
  await btn.click(); await page.waitForTimeout(600);
  await page.getByText('Issue', {exact: true}).last().click(); await page.waitForTimeout(2500);
  check(!!db.report_submissions.find((r) => r.id === 'bf1').issued_at, 'briefing marked issued');
  check((db.daily_briefing_signatures || []).some((s) => s.submission_id === 'bf1' && s.user_id === 'me' && s.signature_image_path === 'sig/me.png'), 'PM signed it automatically');
  const t2 = await page.evaluate(() => document.body.innerText);
  check(/Andy Admin/.test(t2.split('SIGNING')[1] || '') && !/Invalid Date/.test(t2), 'PM shows in the signed list with the time');
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'brief-issue-after.png'), fullPage: true});
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
