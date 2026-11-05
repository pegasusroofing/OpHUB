// New PO, reworked (Andy, 5 Nov 2026): who/when beside the project quote; tick quote items (the quote's number becomes the
// reference); lines with their own VAT rates; Split Purchase across two projects; Save Draft keeps it as a draft;
// View PO shows the PDF in the right-hand panel; Raise PO asks what next; then Email PO / Export PDF. The sums are
// checked to the penny. Fake database only; nothing is emailed.
// node po2-check.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1400, height:1100}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.suppliers = [{id:'s1', org_id:org, name:'Bauder', email:'orders@bauder.test'}]; db.purchase_orders = [];
  db.fin_settings = [{org_id: org, vat_rates: [{code:'20', name:'20% VAT', rate:20, rc:false, active:true}, {code:'5', name:'5% VAT', rate:5, rc:false, active:true}, {code:'0', name:'Zero rated', rate:0, rc:false, active:true}]}];
  db.fin_quotes = [{id:'q1', org_id:org, site_id:S1, purpose:'pquote', supplier_name:'Bauder', quote_no:'Q-1182', quote_date:'2026-10-14'}];
  db.fin_quote_items = [['K4E capsheet 7.5m', 'roll', 86.45], ['DBR 06 underlay', 'roll', 54.275]].map(([d, u, r], i) => ({id:'qi'+i, org_id:org, quote_id:'q1', site_id:S1, supplier_name:'Bauder', description:d, unit:u, rate:r, active:true, position:i}));
  const S2 = db.sites.find((s) => s.id !== S1).id;
  await ctx.route('**/rest/v1/rpc/fin_new_po', async (r) => { const b = JSON.parse(r.request().postData()||'{}'); const id = 'po-new-1'; db.purchase_orders.push({id, org_id:org, site_id:b.p_site, number:'J101-PO-001', supplier_id:b.p_supplier_id, supplier_name:b.p_supplier_name, items:b.p_items, required_by:b.p_required, fulfilment:b.p_delivery, note:b.p_note, value:b.p_items.reduce((t,x)=>t+x.amount,0), status:'open', created_at:new Date().toISOString(), source:'finance'}); r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({id, number:'J101-PO-001'})}); });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/po/new?site='+S1); await page.waitForTimeout(5000);
  await page.getByLabel('Tick K4E capsheet 7.5m').click(); await page.getByLabel('Tick DBR 06 underlay').click();
  await page.getByText('Add 2 Ticked To PO').click(); await page.waitForTimeout(500);
  check(await page.getByLabel('Reference').inputValue() === 'Quote Q-1182', 'the reference fills in from the quote: ' + await page.getByLabel('Reference').inputValue());
  await page.getByPlaceholder('Qty').nth(0).fill('24'); await page.getByPlaceholder('Qty').nth(1).fill('12');
  await page.getByLabel('Discount %').nth(0).fill('10'); await page.getByLabel('Discount %').nth(1).fill('10');
  // line 2 at 5% VAT, typed and Tabbed like the Unit box
  await page.getByLabel('Line 2 VAT').click(); await page.getByLabel('Line 2 VAT').fill('5'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  check(await page.getByText('20% VAT on £1,867.32: £373.46').count() === 1 && await page.getByText('5% VAT on £586.17: £29.31').count() === 1, 'VAT shows for each rate');
  check(await page.getByText('Total £2,856.26').count() === 1, 'total £2,856.26 (1,867.32 + 586.17 + 373.46 + 29.31)');
  // Split Purchase: the whole order 60 / 40 across two projects
  await page.getByText('⇄ Split Purchase').click(); await page.waitForTimeout(300);
  const row2 = page.getByLabel(/Split Purchase.*row 2 project/);
  await row2.click(); await row2.fill((db.sites.find((s) => s.id === S2).job_number || '').slice(0, 4)); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  await page.getByLabel(/Split Purchase.*row 1 percent/).fill('60'); await page.getByLabel(/Split Purchase.*row 2 percent/).fill('40'); await page.waitForTimeout(300);
  check(await page.getByText('Adds up to 100% ✓').count() >= 1, 'the split adds up to 100%');
  await page.getByText('Save Draft', {exact:true}).click(); await page.waitForTimeout(3000);
  const po = db.purchase_orders[0];
  check(po && po.status === 'draft', 'Save Draft leaves it as a draft: ' + (po && po.status));
  check(po && Number(po.value) === 2453.49 && Number(po.vat) === 402.77 && Number(po.total) === 2856.26, 'saved sums: ' + JSON.stringify(po && [po.value, po.vat, po.total]));
  check(po && Array.isArray(po.split) && po.split.length === 2 && Math.round(po.split.reduce((t, x) => t + x.pct, 0) * 10000) / 10000 === 100, 'split across 2 projects, 100%: ' + JSON.stringify(po && po.split));
  await page.getByText('👁 View PO', {exact:true}).click(); await page.waitForTimeout(3000);
  check(await page.locator('canvas').count() >= 1, 'View PO shows the PDF in the right-hand panel');
  await page.getByText('New Purchase Order', {exact:true}).last().scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
  await page.screenshot({path:'shots/job/po2-view-1400.png'});
  await page.getByText('Raise PO', {exact:true}).click(); await page.waitForTimeout(2500);
  check(await page.getByText(/raised — what next\?/).count() === 1, 'Raise PO asks what next');
  await page.screenshot({path:'shots/job/po2-raise-1400.png'});
  await page.getByText('Nothing for now').click(); await page.waitForTimeout(1500);
  check(db.purchase_orders.length === 1 && db.purchase_orders[0].status === 'open', 'the same PO is now raised (open), not a second one');
  check(new URL(page.url()).pathname === '/fin/po/new', 'it stays on this screen');
  check(await page.getByText('✉ Email PO').count() === 1 && await page.getByText('⬇ Export PDF').count() === 1, 'Email PO and Export PDF once raised');
  await page.getByText('✉ Email PO').click(); await page.waitForTimeout(2000);
  const vals = await page.locator('input').evaluateAll((els) => els.map((e) => e.value));
  check(vals.includes('orders@bauder.test') && vals.some((v) => /Purchase order/.test(v)), 'Email PO opens with the supplier and the PO template');
  await page.screenshot({path:'shots/job/po2-email-1400.png'});
  check(!errs.length, 'no errors ' + errs.slice(0, 2).join(' | '));
  await browser.close(); process.exit(0);
})();
