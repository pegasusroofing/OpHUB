// Andy's laptop list, 14 Nov 2026 (evening): Projects' Show drop-down, + New Project and PM the same bigger size;
// Ctrl F opens Finance and Ctrl P opens Projects; Quotes with no search bar or filters above the table (boxes under
// its headings), + New Enquiry above Quoted's outcome tabs, and No News now Submitted. node laptop14c-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const O = db.organizations[0].id, today = new Date().toISOString().slice(0, 10);
  db.quotes = [
    {id: 'q1', org_id: O, client_name: 'Bellway Homes', title: 'Hove Flats', status: 'returned', returned_at: today, value: 42000, created_at: today},
    {id: 'q2', org_id: O, client_name: 'Persimmon', title: 'Ilford School', status: 'negotiating', returned_at: today, value: 18000, created_at: today},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  // Projects: the three the same height.
  await page.goto(B + '/sites'); await page.waitForTimeout(4000);
  const hs = await page.evaluate(() => {
    const byText = (re) => [...document.querySelectorAll('div')].filter((d) => d.childElementCount === 0 && re.test(d.innerText)).map((d) => d.parentElement.getBoundingClientRect().height)[0] || 0;
    return [byText(/^All \(\d+\) ▼$/), byText(/^\+ New Project$/), byText(/^PM ▼$/)];
  });
  check(hs[0] >= 37 && hs.every((h) => !h || Math.abs(h - hs[0]) < 1), `Projects: Show, + New Project and PM the same, bigger (${hs.join(' / ')})`);
  await page.screenshot({path: path.join(SHOTS, 'laptop-projects-buttons.png'), clip: {x: 248, y: 0, width: 1052, height: 320}});
  // Shortcuts.
  await page.keyboard.press('Control+f'); await page.waitForTimeout(2500);
  check(/\/fin(\/|$|\?)/.test(page.url()), `Ctrl F opens Finance (${page.url().split('8081')[1]})`);
  await page.keyboard.press('Control+p'); await page.waitForTimeout(2500);
  check(/\/sites/.test(page.url()), `Ctrl P opens Projects (${page.url().split('8081')[1]})`);
  // Quotes › Quoted.
  await page.goto(B + '/pm/quotes?tab=quoted'); await page.waitForTimeout(4500);
  const t = await page.locator('body').innerText();
  check(!/Search Customer, Project, Address/.test(t) && await page.locator('[aria-label="Filter"] >> visible=true').count() === 0, 'Quotes: no search bar or Filter / Sort above the table');
  check(/Submitted/.test(t) && !/No News/.test(t), 'Quotes: No News is now Submitted');
  const ne = await page.getByText('+ New Enquiry', {exact: true}).filter({visible: true}).first().boundingBox();
  const sub = await page.locator('[aria-label^="Submitted "] >> visible=true').first().boundingBox();
  check(!!ne && !!sub && sub.y > ne.y, 'Quotes: the outcome tabs sit under + New Enquiry');
  const boxes = await page.locator('input[placeholder="Project"] >> visible=true').count();
  check(boxes >= 1, 'Quotes: a search box under the headings');
  await page.screenshot({path: path.join(SHOTS, 'laptop-quotes.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
