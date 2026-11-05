// 4 Nov 2026: unit box on material requests (managers only), PO builder lines (job, Disc %, cost code),
// phone search on Sales, and the Purchases tab row keeping the open tab in view.
// node nov4a-check.js   (fake database)
const {chromium, makeContext} = require('./harness');
const B = 'http://localhost:8081', S = '/sites/11111111-1111-1111-1111-111111111111';
const out = (n) => require('path').join(__dirname, 'shots', 'job', `nov4a-${n}.png`);

async function open(browser, role, width) {
  const {ctx, db} = await makeContext(browser, role, [], {viewport: {width, height: width < 500 ? 844 : 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = role; me.finance_enabled = ['admin', 'pm'].includes(role);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  return {page, db, errs, ctx};
}
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch();
  // 1. Requests: managers see Unit, operatives don't.
  for (const role of ['admin', 'operative']) {
    const {page, errs, ctx} = await open(browser, role, 1300);
    await page.goto(B + S + '/materials/requests'); await page.waitForTimeout(3000);
    const unit = await page.locator('input[aria-label="Unit"]').count();
    check(role === 'admin' ? unit > 0 : unit === 0, `${role}: unit box ${unit ? 'shown' : 'hidden'}`);
    if (role === 'admin') {
      await page.fill('input[placeholder="e.g. 18mm OSB 2440 x 1220"]', 'Test battens');
      await page.fill('input[placeholder="0"]', '12');
      await page.locator('input[aria-label="Unit"]').fill('lm');
      await page.screenshot({path: out('request-unit')});
    } else await page.screenshot({path: out('request-operative')});
    check(!errs.length, `${role}: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  // 2. PO builder on a laptop.
  {
    const {page, errs, ctx} = await open(browser, 'admin', 1300);
    await page.goto(B + '/fin/po/new?site=11111111-1111-1111-1111-111111111111'); await page.waitForTimeout(3500);
    check(await page.getByText('Disc %').count() > 0, 'PO builder: Disc % heading');
    check(await page.getByText('Job', {exact: true}).count() > 0, 'PO builder: Job heading');
    await page.fill('input[placeholder="Description"]', 'Batten 25x50');
    await page.fill('input[aria-label="Qty"]', '100');
    await page.fill('input[aria-label="Rate"]', '2');
    await page.fill('input[aria-label="Discount %"]', '10');
    await page.waitForTimeout(300);
    check(await page.getByText('£180.00').count() > 0, 'PO builder: 100 × £2 less 10% = £180.00');
    await page.screenshot({path: out('po-builder')});
    check(!errs.length, `PO builder: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  // 3. Phone: Sales search, Purchases tab row.
  {
    const {page, errs, ctx} = await open(browser, 'admin', 390);
    await page.goto(B + '/fin/sales?tab=invoices'); await page.waitForTimeout(3500);
    check(await page.locator('input[placeholder="Search invoices"]').count() > 0, 'phone: Sales invoices search');
    await page.screenshot({path: out('phone-sales-invoices')});
    await page.goto(B + '/fin/sales?tab=apps'); await page.waitForTimeout(3000);
    check(await page.locator('input[placeholder="Search applications"]').count() > 0, 'phone: Sales applications search');
    for (const [route, label] of [['/fin/purchases?tab=plant', 'Plant Hire'], ['/fin/yard', 'Yard']]) {
      await page.goto(B + route); await page.waitForTimeout(3500);
      const box = await page.getByText(label, {exact: true}).last().boundingBox();
      check(!!box && box.x >= 0 && box.x + box.width <= 390, `phone: ${label} tab in view (x=${box && Math.round(box.x)})`);
      await page.screenshot({path: out(`phone-${label.replace(' ', '-').toLowerCase()}`)});
    }
    check(!errs.length, `phone: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
})();
