// Quotes › Live on a phone (Andy, 14 Nov 2026): tap a live quote's Status in the table to change it (Pricing, Awaiting
// Information, Ready For Checking), the current one ticked; it saves, and moves the quote's OneDrive folder like the
// quote's own page does. A quoted job's Status still opens the quote. Touch phone, fake database. node quotestatus-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const org = me.org_id;
  db.quotes = [
    {id: 'q1', org_id: org, client_name: 'Bellway Homes', title: 'Hove Flats re-roof', status: 'pricing', return_date: '2099-11-20', chase_on: true, chase_count: 0, folder_id: 'f1', created_at: '2026-11-01T08:00:00Z'},
    {id: 'q5', org_id: org, client_name: 'Countryside', title: 'Lewes Barns', status: 'awaiting', return_date: '2099-01-30', chase_on: true, chase_count: 0, created_at: '2026-10-21T08:00:00Z'},
    {id: 'q2', org_id: org, client_name: 'Persimmon', title: 'Ashford School', status: 'returned', value: 84000, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, chase_count: 0, created_at: '2026-10-01T08:00:00Z'},
  ];
  db.quote_clients = []; db.quote_chases = [];
  db.quote_settings = [{org_id: org, chase_enabled: true, chase_first_days: 30, chase_every_days: 14, chase_max: 3}];
  const calls = [];
  await ctx.route(/functions\/v1\/quote-tracker/, (r) => { calls.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/pm/quotes'); await page.waitForTimeout(5000);
  const cell = page.locator('[aria-label="Hove Flats re-roof: Pricing"] >> visible=true').first();
  check(/Pricing ▾/.test(await cell.innerText()), 'a live quote\'s Status shows ▾');
  await cell.click(); await page.waitForTimeout(700);
  const t = await page.locator('body').innerText();
  check(/Hove Flats re-roof: Status/.test(t) && /✓ Pricing/.test(t) && /Awaiting Information/.test(t) && /Ready For Checking/.test(t), 'tapping it lists the three, the current one ticked');
  await page.screenshot({path: path.join(SHOTS, 'quote-status-pick.png')});
  await page.getByText('Ready For Checking', {exact: true}).last().click(); await page.waitForTimeout(2000);
  check(db.quotes.find((x) => x.id === 'q1').status === 'checking', 'choosing Ready For Checking saves it');
  check(calls.some((c) => c.action === 'status' && c.quote_id === 'q1' && c.status === 'checking') || calls.some((c) => JSON.stringify(c).includes('checking')), `its folder moves too (${JSON.stringify(calls).slice(0, 120)})`);
  check(new URL(page.url()).pathname === '/pm/quotes' && await page.locator('[aria-label^="Hove Flats re-roof: Ready"] >> visible=true').count() === 1, 'the table shows the new status, still on the list');
  await page.screenshot({path: path.join(SHOTS, 'quote-status-after.png')});
  // ✕ changes nothing
  await page.locator('[aria-label^="Lewes Barns:"] >> visible=true').last().click(); await page.waitForTimeout(600);
  await page.getByLabel('Close').last().click(); await page.waitForTimeout(600);
  check(db.quotes.find((x) => x.id === 'q5').status === 'awaiting', 'closing the list with ✕ changes nothing');
  // Quoted: Status opens the quote, no list
  await page.getByRole('tab', {name: /^Quoted/}).first().click(); await page.waitForTimeout(1200);
  await page.locator('[aria-label^="Ashford School:"] >> visible=true').last().click(); await page.waitForTimeout(2500);
  check(/\/pm\/quotes\/q2/.test(page.url()), 'a quoted job\'s Status still opens the quote');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
