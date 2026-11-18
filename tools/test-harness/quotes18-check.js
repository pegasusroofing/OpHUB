// Quotes tables (Andy, 18 Nov 2026: "in quotes we need the search cells under the headers please" and "throughout the
// quotes tables (all of them) the rows are a little deep, we dont need the address underneath so lets make them a little
// less deep"). Laptop: every tab (Live too) has the search boxes under the headings; no address under the project's
// name, yet its box still finds it; shallower rows. Phone: shallower rows too. Fake database. node quotes18-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'quotes18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const seed = (db) => {
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const org = me.org_id;
  db.quotes = [
    {id: 'q1', org_id: org, client_name: 'Bellway Homes', title: 'Hove Flats re-roof', address: '12 Kings Rd, Hove', postcode: 'BN3 1AA', discipline: 'Flat Roofing', status: 'pricing', return_date: '2026-11-25', chase_on: false, chase_count: 0, created_at: '2026-11-01T08:00:00Z'},
    {id: 'q5', org_id: org, client_name: 'Taylor Wimpey', title: 'Brighton Marina', address: '3 Marina Way', postcode: 'BN2 5UF', discipline: 'Pitched Roofing', status: 'pricing', return_date: '2026-11-28', chase_on: false, chase_count: 0, created_at: '2026-11-02T08:00:00Z'},
    {id: 'q2', org_id: org, client_name: 'Persimmon', title: 'Ashford School', address: '1 School Lane', postcode: 'TN24 8AA', discipline: 'Pitched Roofing', status: 'returned', value: 84000, profit_pct: 0.12, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: false, chase_count: 0, created_at: '2026-10-20T08:00:00Z'},
  ];
  db.quote_clients = []; db.quote_chases = [];
  db.quote_settings = [{org_id: org, chase_enabled: false}];
};
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
// The height of the row a quote's name is in.
const rowH = (page, name) => page.evaluate((n) => {
  const e = [...document.querySelectorAll('div[dir="auto"]')].find((x) => x.textContent.trim() === n && x.getBoundingClientRect().width > 0);
  let r = e; while (r && !(r.getAttribute('role') === 'button' || r.tabIndex === 0)) r = r.parentElement;
  return r ? Math.round(r.getBoundingClientRect().height) : null;
}, name);

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);
  await page.goto(B + '/pm/quotes?tab=live'); await page.waitForTimeout(5000);
  check(await page.locator('[aria-label="Filter Project"] >> visible=true').count() === 1 && await page.locator('[aria-label="Filter Customer"] >> visible=true').count() === 1, 'laptop Live: search boxes under the headings');
  check(!/12 Kings Rd/.test(await body()), 'no address under the project\'s name');
  const h = await rowH(page, 'Hove Flats re-roof');
  check(!!h && h <= 44, `shallower rows (${h}px; were 52)`);
  await page.screenshot({path: path.join(SHOTS, 'live-laptop.png')});
  await page.locator('[aria-label="Filter Project"] >> visible=true').fill('kings'); await page.waitForTimeout(600);
  let t = await body();
  check(/Hove Flats re-roof/.test(t) && !/Brighton Marina/.test(t), 'the Project box still finds a quote by its address');
  await page.goto(B + '/pm/quotes?tab=quoted'); await page.waitForTimeout(4500);
  check(await page.locator('[aria-label="Filter Project"] >> visible=true').count() === 1, 'laptop Quoted: search boxes too');
  await page.goto(B + '/pm/quotes?tab=all'); await page.waitForTimeout(4500);
  check(await page.locator('[aria-label="Filter Project"] >> visible=true').count() === 1, 'laptop All: search boxes too');
  await page.screenshot({path: path.join(SHOTS, 'all-laptop.png')});
  await ctx.close();

  const p = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  seed(p.db);
  const pg = await p.ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  await signIn(pg);
  await pg.goto(B + '/pm/quotes?tab=live'); await pg.waitForTimeout(5000);
  check(await pg.locator('[aria-label="Search Project"] >> visible=true').count() === 1, 'phone Live: search boxes under the headings');
  const ph = await rowH(pg, 'Hove Flats re-roof');
  check(!!ph && ph <= 46, `phone: shallower rows (${ph}px; were about 51)`);
  await pg.screenshot({path: path.join(SHOTS, 'live-phone.png')});
  await p.ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
