// Quotes on a phone, as the laptop table (Andy, 14 Nov 2026): tap a heading to sort (A to Z, Z to A, off), a search box
// under each column (Status a ▾ choice), and no Filter / Sort buttons. Touch phone, fake database. node quotecols-check.js
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
  const q = (id, title, client, status, more) => ({id, org_id: org, client_name: client, title, status, chase_on: false, chase_count: 0, created_at: '2026-10-01T08:00:00Z', ...more});
  db.quotes = [
    q('q1', 'Hove Flats re-roof', 'Bellway Homes', 'pricing', {return_date: '2099-11-20', created_at: '2026-11-03T08:00:00Z'}),
    q('q5', 'Lewes Barns', 'Countryside', 'awaiting', {return_date: '2099-01-30', created_at: '2026-11-02T08:00:00Z'}),
    q('q6', 'Brighton Depot', 'Osborne', 'checking', {return_date: '2099-06-15', created_at: '2026-11-01T08:00:00Z'}),
    q('q2', 'Ashford School', 'Persimmon', 'returned', {value: 84000, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, next_chase_date: '2026-12-01'}),
    q('q3', 'Croydon Depot', 'Osborne', 'won', {value: 120500, return_date: '2026-09-10', returned_at: '2026-09-10', completed_at: '2026-10-02'}),
    q('q4', 'Rye Cottages', 'Barratt', 'lost', {value: 9000, return_date: '2026-08-10', returned_at: '2026-08-10'}),
  ];
  db.quote_clients = []; db.quote_chases = [];
  db.quote_settings = [{org_id: org, chase_enabled: true, chase_first_days: 30, chase_every_days: 14, chase_max: 3}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/pm/quotes'); await page.waitForTimeout(5000);
  const titles = db.quotes.map((x) => x.title);
  const order = async () => page.locator('[aria-label="Quotes table"] >> visible=true').first().evaluate((el, ts) => [...el.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label')).filter((l) => ts.includes(l)), titles);
  const tap = async (label) => { await page.locator(`[aria-label="${label}"] >> visible=true`).first().click(); await page.waitForTimeout(500); };

  check(await page.locator('[aria-label="Filter"] >> visible=true').count() === 0 && await page.locator('[aria-label="Sort"] >> visible=true').count() === 0, 'no Filter or Sort buttons on the phone');
  check(await page.locator('[aria-label="Search quotes"] >> visible=true').count() === 1, 'the search box at the top is still there');
  const fs = await page.locator('[aria-label="Search Project"] >> visible=true').first().evaluate((e) => getComputedStyle(e).fontSize);
  const vp = await page.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute('content'));
  check(fs === '14.4px' && /maximum-scale=1/.test(vp), `the column boxes are the app's phone size (${fs}) and the page won't zoom into them`);
  const o0 = await order();
  await tap('Sort by Project'); const o1 = await order();
  check(o1.join('|') === 'Brighton Depot|Hove Flats re-roof|Lewes Barns', `Project heading: A to Z (${o1.join(', ')})`);
  await page.screenshot({path: path.join(SHOTS, 'quote-cols-sort.png')});
  await tap('Sort by Project'); const o2 = await order();
  check(o2.join('|') === 'Lewes Barns|Hove Flats re-roof|Brighton Depot', 'again: Z to A');
  await tap('Sort by Project'); const o3 = await order();
  check(o3.join('|') === o0.join('|'), 'again: back to how it was');
  await tap('Sort by Due Back'); const o4 = await order();
  check(o4[0] === 'Lewes Barns' && o4[2] === 'Hove Flats re-roof', `Due Back heading: soonest first (${o4.join(', ')})`);
  await tap('Sort by Due Back'); await tap('Sort by Due Back');

  await page.locator('[aria-label="Search Project"] >> visible=true').first().fill('bell'); await page.waitForTimeout(500);
  check((await order()).join('|') === 'Hove Flats re-roof', 'Project box: "bell" finds the Bellway job (customer too)');
  await page.locator('[aria-label="Search Project"] >> visible=true').first().fill(''); await page.waitForTimeout(300);
  await page.locator('[aria-label="Search Date"] >> visible=true').first().fill('jun'); await page.waitForTimeout(500);
  check((await order()).join('|') === 'Brighton Depot', 'Date box: "jun" finds the one due back in June');
  await page.locator('[aria-label="Search Date"] >> visible=true').first().fill(''); await page.waitForTimeout(300);
  await tap('Search Status');
  check(/Any Status/.test(await page.locator('body').innerText()) && /Ready For Checking/.test(await page.locator('body').innerText()), 'Status ▾ lists the statuses');
  await page.getByText('Ready For Checking', {exact: true}).last().click(); await page.waitForTimeout(500);
  check((await order()).join('|') === 'Brighton Depot', 'Status: Ready For Checking shows just that one');
  await page.screenshot({path: path.join(SHOTS, 'quote-cols-status.png')});
  await page.locator('[aria-label="Search Project"] >> visible=true').first().fill('zzz'); await page.waitForTimeout(400);
  check(/No quotes match/.test(await page.locator('body').innerText()) && await page.locator('[aria-label="Search Project"] >> visible=true').count() === 1, 'nothing found: the table and its boxes stay, so you can change them');
  await tap('Clear the column searches');
  check((await order()).length === 3 && !(await page.locator('[aria-label="Search Project"] >> visible=true').first().inputValue()), '✕ Clear The Column Searches shows them all again');

  // Quoted: Value and Chase boxes
  await page.getByRole('tab', {name: /^Quoted/}).first().click(); await page.waitForTimeout(1200);
  await page.locator('[aria-label="Search Value"] >> visible=true').first().fill('>50k'); await page.waitForTimeout(500);
  const ov = await order();
  check(ov.length === 2 && !ov.includes('Rye Cottages'), `Value box: ">50k" (${ov.join(', ')})`);
  await page.locator('[aria-label="Search Value"] >> visible=true').first().fill(''); await page.waitForTimeout(300);
  await tap('Sort by Value'); const ovs = await order();
  check(ovs.join('|') === 'Rye Cottages|Ashford School|Croydon Depot', `Value heading: lowest first (${ovs.join(', ')})`);
  await page.locator('[aria-label="Search Chase"] >> visible=true').first().fill('auto'); await page.waitForTimeout(500);
  check((await order()).join('|') === 'Ashford School', 'Chase box: "auto" finds the one the chaser sends');
  await page.screenshot({path: path.join(SHOTS, 'quote-cols-quoted.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
