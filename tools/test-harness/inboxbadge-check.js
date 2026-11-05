// A manager's phone bar on a job shows the job's unread Inbox count (it never showed; found 5 Nov 2026). Fake database only.
// node inboxbadge-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'pm'; me.howto_dismissed = ['*'];
  const now = new Date().toISOString();
  db.messages = (db.messages || []).concat([1, 2].map((i) => ({id: 'mb' + i, org_id: me.org_id, site_id: S1, sender_id: 'o1', audience: 'managers', kind: 'message', body: 'Need more slates ' + i, created_at: now})));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/sites/' + S1); await page.waitForTimeout(5000);
  const bar = await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent === 'Inbox'); let n = el; for (let i = 0; i < 4 && n; i++) n = n.parentElement; return n ? n.innerText : ''; });
  check(/\d/.test(bar), `Inbox on the job's bar shows a count (${bar.replace(/\s+/g, ' ')})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'inboxbadge-phone.png')});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
