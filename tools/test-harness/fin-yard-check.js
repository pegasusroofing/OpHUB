// Finance › Purchases › Yard stock (Andy, 9 Nov 2026: "a little stuck in yard stock"): the trail reads Finance › Purchases ›
// Yard Stock › the item; an item keeps the Purchases tabs; Back and Yard Stock in the trail go back to the list; the Issue
// pop-up shows the rate and what it costs the job as the qty is typed. Since 14 Nov 2026 Issue is ⬆ Book Out › To A Job.
// Laptop, fake database. node fin-yard-check.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.yard_stock = [{id: 'y1', org_id: org, item: 'Code 4 Lead', unit: 'roll', qty: 10, active: true, category: 'Lead & metals'}];
  db.yard_stock_rates = [{stock_id: 'y1', org_id: org, rate: 45.5}];
  db.yard_moves = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(BASE + '/fin/yard'); await page.waitForTimeout(5000);
  check(/Finance › Purchases › Yard Stock/.test(await body()), 'the list: the trail reads Finance › Purchases › Yard Stock');
  await page.locator('text="Code 4 Lead" >> visible=true').first().click(); await page.waitForTimeout(2500);
  let t = await body();
  check(/[?&]id=y1/.test(page.url()) && /Purchases › Yard Stock › Code 4 Lead/.test(t), 'an item: the trail follows through, Purchases › Yard Stock › Code 4 Lead');
  check(/Purchase Invoices/.test(t) && /Purchase Orders/.test(t) && /Plant Hire/.test(t) && /Stock/.test(t), 'an item keeps the Purchases tabs');
  await page.screenshot({path: 'shots/fin-yard-item.png'});
  // Issue to a job: the rate and the cost to the job.
  await page.locator('text="⬆ Book Out" >> visible=true').last().click(); await page.waitForTimeout(800);
  await page.getByText('To A Job', {exact: true}).last().click(); await page.waitForTimeout(800);
  t = await body();
  check(/£45\.50 per roll/.test(t) && /enter the qty to see the cost/.test(t), 'Issue pop-up: the rate per roll before a qty');
  await page.getByLabel('Qty', {exact: true}).fill('4'); await page.waitForTimeout(400);
  check(/Cost To The Job £182\.00/.test(await body()), 'Issue pop-up: 4 rolls › Cost To The Job £182.00');
  await page.getByLabel('Job', {exact: true}).click(); await page.waitForTimeout(500);
  await page.locator('text=/Studley Rd/ >> visible=true').last().click(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/fin-yard-issue.png'});
  await page.getByText('Book Out', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const mv = db.yard_moves.find((m) => m.kind === 'issue');
  check(!!mv && Number(mv.qty) === 4 && mv.site_id === S1 && mv.stock_id === 'y1', 'issued: 4 rolls to the job');
  // Back to the list.
  await page.goBack(); await page.waitForTimeout(2500);
  check(!/[?&]id=/.test(page.url()) && /\/fin\/yard/.test(page.url()) && /Stock Value/i.test(await body()), 'Back: the yard list again');
  await page.locator('text="Code 4 Lead" >> visible=true').first().click(); await page.waitForTimeout(2500);
  const ys = page.locator('text="Yard Stock" >> visible=true'); let top = null, ty = 1e9;
  for (let i = 0; i < await ys.count(); i++) { const b = await ys.nth(i).boundingBox(); if (b && b.y < ty) { ty = b.y; top = ys.nth(i); } }
  await top.click(); await page.waitForTimeout(2500);
  check(!/[?&]id=/.test(page.url()) && /Stock Value/i.test(await body()), 'Yard Stock in the trail: the list again');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
