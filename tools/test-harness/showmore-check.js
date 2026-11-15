// Long lists (speed review, 15 Nov 2026): Purchases, Sales, Materials and the Projects list draw their first 50 rows,
// then "Show More (N Left)" adds 50 more; the counts and totals still use every row. A busy company (seeds/big.js) on
// a laptop. Screenshots to shots/speed/. node showmore-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = process.env.BASE || 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'speed');
require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const S1 = '11111111-1111-1111-1111-111111111111';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/big')(db);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForSelector('input[placeholder="you@yourcompany.co.uk"]', {timeout: 60000});
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForURL(/\/home/, {timeout: 60000}); await page.waitForTimeout(3000);
  const rows = (re) => page.evaluate((src) => [...document.querySelectorAll('div')].filter((d) => d.childElementCount === 0 && new RegExp(src).test(d.innerText)).length, re.source);
  // Purchases › Approved: 1,470 invoices.
  await page.goto(B + '/fin/purchases?tab=invoices&f=unpaid'); await page.getByText('SIG-').first().waitFor({timeout: 60000}); await page.waitForTimeout(1500);
  const pi = await rows(/^SIG-\d+$/);
  check(pi === 50, `Purchases: the first 50 invoices drawn (${pi})`);
  const more = page.getByText(/^Show More \(1,420 Left\)$/);
  check(await more.count() === 1, 'Purchases: "Show More (1,420 Left)" under the list');
  check(/Approved\s*1470/.test(await page.locator('body').innerText()), 'Purchases: the Approved count still counts every invoice (1470)');
  await more.scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(SHOTS, 'showmore-purchases.png')});
  await more.click(); await page.waitForTimeout(1000);
  const pi2 = await rows(/^SIG-\d+$/);
  check(pi2 === 100, `Purchases: Show More draws 50 more (${pi2})`);
  check(await page.getByText(/^Show More \(1,370 Left\)$/).count() === 1, 'Purchases: then "Show More (1,370 Left)"');
  // Sales › Applications & Certificates: 1,200.
  await page.goto(B + '/fin/sales'); await page.getByText('Raise Invoice').first().waitFor({timeout: 60000}); await page.waitForTimeout(1500);
  const ap = await page.getByText('Raise Invoice').count();
  check(ap === 50, `Sales: the first 50 applications drawn (${ap})`);
  check(await page.getByText(/^Show More \([\d,]+ Left\)$/).count() === 1, 'Sales: Show More under the list');
  // Materials › Requests on the first job: 300.
  await page.goto(B + `/sites/${S1}/materials/requests`); await page.getByText('Item 1', {exact: false}).first().waitFor({timeout: 60000}); await page.waitForTimeout(1500);
  check(await page.getByText(/^Show More \([\d,]+ Left\)$/).count() === 1, 'Materials: Show More under the requests');
  await page.getByText(/^Show More/).scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(SHOTS, 'showmore-materials.png')});
  // Projects: closed group of 60-odd.
  await page.goto(B + '/sites'); await page.getByText('Cleveland Primary School').first().waitFor({timeout: 60000}); await page.waitForTimeout(1000);
  console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
  if (errs.length) process.exitCode = 1;
  await browser.close();
})();
