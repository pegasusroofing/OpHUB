// Quote "Won: Link To Existing Job" (4 Nov 2026), fake database, OneDrive calls caught (nothing really moves):
// pick a job → its job folder is made if it hasn't one → quote-tracker 'won' moves the enquiry folder into it → the quote is won and linked.
// node quotelink-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  db.quotes = [{id: 'q1', org_id: me.org_id, client_name: 'Bellway Homes', title: 'Studley Rd extra works', status: 'returned', value: 12000, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, chase_count: 0, folder_id: 'F1', folder_drive_id: 'D1', folder_name: 'Studley Rd extra works', created_at: '2026-10-20T08:00:00Z'}];
  db.quote_settings = [{org_id: me.org_id, chase_enabled: false, chase_first_days: 30, chase_every_days: 14, chase_max: 3}];
  db.quote_chases = [];
  const fns = [];
  await ctx.route(/functions\/v1\/(quote-tracker|onedrive-job-pack)/, (r) => { const n = r.request().url().split('/functions/v1/')[1].split('?')[0]; fns.push([n, JSON.parse(r.request().postData() || '{}')]); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(n === 'quote-tracker' ? {ok: true, how: 'moved'} : {path: 'Jobs/J101', made: 3, copied: 0, failed: []})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/pm/quotes/q1'); await page.waitForTimeout(4000);
  check(await page.getByText('Won – Link To Job').count() > 0, 'button shows on a quote not yet won');
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'quotelink-button.png')});
  await page.getByText('Won – Link To Job').click(); await page.waitForTimeout(800);
  await page.getByText(/J101 Studley Rd/).last().click(); await page.waitForTimeout(800);
  await page.getByText('Yes, Link It', {exact: true}).click(); await page.waitForTimeout(3000);
  const won = fns.find(([n, b]) => n === 'quote-tracker' && b.action === 'won');
  check(!!won && won[1].site_id === S1 && won[1].quote_id === 'q1', `moves the folder into that job (${JSON.stringify(fns.map((f) => [f[0], f[1].action]))})`);
  const q = db.quotes.find((x) => x.id === 'q1');
  check(q.status === 'won' && q.site_id === S1 && q.chase_on === false, `quote marked won and linked, chaser off (${q.status}, ${q.site_id === S1}, chase ${q.chase_on})`);
  check(page.url().includes('/sites/' + S1), 'opens the job');
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
