// One enquiry, several clients (4 Nov 2026), fake database, OneDrive calls caught:
//  - the quote lists the main client and the others; a client can be added from the Directory;
//  - Won: Convert To Job asks which client it was won from; that client becomes the main one and the job is made for them;
//  - Quotes › By Customer counts the quote for every client (won for the winner, not won for the others).
// node quoteclients-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const shot = (n) => path.join(__dirname, 'shots', 'job', `quoteclients-${n}.png`);
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const org = me.org_id;
  db.fin_clients = [{id: 'c1', org_id: org, name: 'Bellway Homes'}, {id: 'c2', org_id: org, name: 'Persimmon'}, {id: 'c3', org_id: org, name: 'Barratt'}];
  db.quotes = [{id: 'q1', org_id: org, client_id: 'c1', client_name: 'Bellway Homes', contact_email: 'buyer@bellway.example', title: 'Hove Flats re-roof', status: 'returned', value: 80000, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, chase_count: 0, created_at: '2026-10-20T08:00:00Z'}];
  db.quote_clients = [{id: 'qc1', org_id: org, quote_id: 'q1', client_id: 'c2', client_name: 'Persimmon', contact_email: 'est@persimmon.example', created_at: '2026-10-21T08:00:00Z'}];
  db.quote_settings = [{org_id: org, chase_enabled: false, chase_first_days: 30, chase_every_days: 14, chase_max: 3}];
  db.quote_chases = [];
  await ctx.route(/rest\/v1\/rpc\/quote_client_search_v2/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify([{id: 'c3', name: 'Barratt', email: null, phone: null, markup: 12}])}));
  await ctx.route(/rest\/v1\/rpc\/quote_add_client/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"c3"'}));
  await ctx.route(/functions\/v1\/(quote-tracker|onedrive-job-pack)/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, path: 'Jobs/X', made: 1, copied: 0, failed: []})}));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto(B + '/pm/quotes/q1'); await page.waitForTimeout(4000);
  check(await page.getByText('Clients Tendering').count() > 0 && await page.getByText(/Persimmon/).count() > 0, 'quote shows the other client');
  await page.getByPlaceholder('Start typing to search your Directory').first().fill('Barr'); await page.waitForTimeout(1500);
  await page.getByText('+ Barratt').click(); await page.waitForTimeout(2000);
  check(db.quote_clients.some((c) => c.quote_id === 'q1' && c.client_name === 'Barratt'), 'adds a client from the Directory');
  await page.screenshot({path: shot('card')});

  await page.getByText('🏆 Won: Convert To Job').click(); await page.waitForTimeout(800);
  check(await page.getByText('Which client did you win it from?').count() > 0, 'asks which client it was won from');
  await page.screenshot({path: shot('which')});
  await page.getByText('Persimmon', {exact: true}).last().click(); await page.waitForTimeout(800);
  await page.getByText('Won, make the job', {exact: true}).click(); await page.waitForTimeout(5000);
  const q = db.quotes.find((x) => x.id === 'q1');
  const site = (db.sites || []).find((s) => s.id === q.site_id);
  check(q.status === 'won' && q.client_name === 'Persimmon', `quote won from Persimmon (${q.status}, ${q.client_name})`);
  check(!!site && site.client_name === 'Persimmon', `job made for Persimmon (${site && site.client_name})`);
  check(db.quote_clients.some((c) => c.quote_id === 'q1' && c.client_name === 'Bellway Homes'), 'Bellway stays on the quote as another client');

  await page.goto(B + '/pm/quotes'); await page.waitForTimeout(4000);
  await page.getByText('All', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.locator('text=List').first().click(); await page.waitForTimeout(600);
  await page.getByText('By Customer', {exact: true}).last().click(); await page.waitForTimeout(1500);
  const t = await page.evaluate(() => document.body.innerText);
  check(/Persimmon/.test(t) && /Bellway Homes/.test(t) && /Barratt/.test(t), 'By Customer lists every client on the quote');
  await page.screenshot({path: shot('bycustomer')});
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
