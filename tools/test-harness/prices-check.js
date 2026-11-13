// Purchases › Price Lists (Andy, 14 Nov 2026: "Price lists should be one tab only, remove price book … per company"): one
// tab, no Price Book; a table of suppliers; tap one for their prices, the price list's and the learned ones together.
// Laptop and phone, fake database. node prices-check.js   (more on the phone: yardprices-phone-check.js)
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch();
  for (const width of [1300, 390]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width, height: width < 500 ? 844 : 900}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true;
    const O = me.org_id;
    db.fin_quotes = [{id: 'q1', org_id: O, purpose: 'pquote', site_id: null, supplier_name: 'Bauder', quote_no: '2026 Rates', quote_date: '2026-01-05', file_name: 'bauder.xlsx', created_at: '2026-01-05T09:00:00Z'}];
    db.fin_quote_items = [{id: 'qi1', org_id: O, quote_id: 'q1', site_id: null, active: true, supplier_name: 'Bauder', description: 'Thermofol U 15 Membrane', unit: 'm2', rate: 12.5, position: 0}];
    db.fin_price_book = [{id: 'pb1', org_id: O, supplier_key: 'bauder', supplier_name: 'Bauder', description: 'Bauder Primer 25L', unit: 'tin', rate: 64, source: 'invoice', updated_at: '2026-10-10T09:00:00Z'}];
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/fin/purchases?tab=prices'); await page.waitForTimeout(4000);
    check(await page.getByText('Price Book', {exact: true}).count() === 0, `${width}: no Price Book tab`);
    const t = await page.locator('[aria-label="Price lists"] >> visible=true').first().innerText().catch(() => '');
    check(/Bauder/.test(t) && /\b2\b/.test(t), `${width}: a table of suppliers (Bauder, 2 items)`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `prices-${width}-book.png`)});
    await page.locator('[aria-label="Price lists"] >> visible=true').first().getByText('Bauder', {exact: true}).click(); await page.waitForTimeout(2500);
    const p = await page.locator('[aria-label="Prices"] >> visible=true').first().innerText().catch(() => '');
    check(/sup=Bauder/.test(page.url()) && /Thermofol/.test(p) && /Bauder Primer/.test(p), `${width}: Bauder opens their prices, the list's and the learned one`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `prices-${width}-lists.png`)});
    check(!errs.length, `${width}: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
})();
