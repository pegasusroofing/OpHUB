// Chase every client (4 Nov 2026), fake database; the send is caught, nothing is emailed:
// set the contact on another client tendering the job, then Chase Now lists every client's email and calls the chaser once.
// (The server sends one personalised email per client; that part runs on the real server only.)
// node quotechase-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const org = me.org_id;
  db.quotes = [{id: 'q1', org_id: org, client_name: 'Bellway Homes', contact_name: 'Bob', contact_email: 'bob@bellway.example', title: 'Hove Flats re-roof', status: 'returned', value: 80000, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, chase_count: 0, created_at: '2026-10-20T08:00:00Z'}];
  db.quote_clients = [{id: 'qc1', org_id: org, quote_id: 'q1', client_name: 'Persimmon', created_at: '2026-10-21T08:00:00Z'}];
  db.quote_settings = [{org_id: org, chase_enabled: true, chase_first_days: 30, chase_every_days: 14, chase_max: 3}];
  db.quote_chases = [];
  const calls = [];
  await ctx.route(/functions\/v1\/quote-tracker/, (r) => { calls.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/pm/quotes/q1'); await page.waitForTimeout(4000);
  // 11 Nov 2026: the chaser says who it goes to; the other clients are in Client And Project (folded once quoted).
  check(await page.getByText(/Goes to Bob at Bellway Homes \(from/).count() > 0, 'before: only the main contact can be chased');
  await page.getByRole('button', {name: 'Client And Project'}).click(); await page.waitForTimeout(500);
  await page.getByText(/^Persimmon/).first().click(); await page.waitForTimeout(600);
  await page.getByText('✉ Add The Contact To Chase').click(); await page.waitForTimeout(600);
  const box = page.locator('input').last();
  await box.fill('Sue'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  await page.locator('input').last().fill('sue@persimmon.example'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  const c = db.quote_clients.find((x) => x.id === 'qc1');
  check(c.contact_name === 'Sue' && c.contact_email === 'sue@persimmon.example', `contact saved on Persimmon (${c.contact_name}, ${c.contact_email})`);
  check(await page.getByText(/and 1 more/).count() > 0, 'after: the chaser covers both clients');
  await page.getByText('✉ Chase Now').click(); await page.waitForTimeout(600);
  const t = await page.evaluate(() => document.body.innerText);
  check(t.includes('bob@bellway.example, sue@persimmon.example'), 'Chase Now asks with both emails');
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'quotechase-confirm.png')});
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(calls.filter((x) => x.action === 'chase').length === 1, 'one chase call (the server emails each client)');
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
