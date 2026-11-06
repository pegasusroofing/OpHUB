// New PO (Andy, 5 Nov 2026): the project quote as a shopping list (tick, Add To PO), delivery to the job address by
// default with time and offload, then on the PO: View PO and Send PO (the sales-invoice style pop-up with the
// supplier's email and the PO template). Fake database only; nothing is emailed.
// node pofull-check.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1400, height:1000}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.suppliers = [{id:'s1', org_id:org, name:'Bauder', email:'orders@bauder.test'}]; db.purchase_orders = [];
  db.fin_quotes = [{id:'q1', org_id:org, site_id:S1, purpose:'pquote', supplier_name:'Bauder', quote_no:'Q-1182', quote_date:'2026-10-14'}];
  db.fin_quote_items = [['K4E capsheet 7.5m', 'roll', 86.45], ['DBR 06 underlay', 'roll', 54.275], ['PIR FA-TE 120mm', 'board', 23.18]].map(([d, u, r], i) => ({id:'qi'+i, org_id:org, quote_id:'q1', site_id:S1, supplier_name:'Bauder', description:d, unit:u, rate:r, active:true, position:i}));
  await ctx.route('**/rest/v1/rpc/fin_new_po', async (r) => { const b = JSON.parse(r.request().postData()||'{}'); const id = 'po-new-1'; db.purchase_orders.push({id, org_id:org, site_id:b.p_site, number:'J101-PO-001', supplier_id:b.p_supplier_id, supplier_name:b.p_supplier_name, items:b.p_items, required_by:b.p_required, fulfilment:b.p_delivery, note:b.p_note, value:b.p_items.reduce((t,x)=>t+x.amount,0), status:'open', created_at:new Date().toISOString(), source:'finance'}); r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({id, number:'J101-PO-001'})}); });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/po/new?site='+S1); await page.waitForTimeout(5000);
  check(await page.getByText('From The Project Quote').count() === 1, 'the project quote shows as a shopping list');
  await page.getByLabel('Tick K4E capsheet 7.5m').click(); await page.getByLabel('Tick DBR 06 underlay').click();
  await page.getByText('Add 2 Ticked To PO').click(); await page.waitForTimeout(500);
  check(await page.getByPlaceholder('Type to find a supplier, or a new name').inputValue() === 'Bauder', 'the supplier fills in from the quote');
  await page.getByPlaceholder('Qty').nth(0).fill('24'); await page.getByPlaceholder('Qty').nth(1).fill('12');
  await page.getByText('Hiab / Crane Offload').click(); await page.getByText('Call 30 Min Before').click();
  await page.screenshot({path:'shots/job/pofull-new-1400.png', fullPage:true});
  await page.getByText('Raise PO', {exact:true}).click(); await page.waitForTimeout(5000);
  const po = db.purchase_orders[0];
  check(po && po.items.length === 2 && po.items[0].rate === 86.45, 'raised with the two quote lines: ' + JSON.stringify(po && po.items.map((i) => [i.item, i.qty, i.rate])));
  check(po && po.delivery_to === 'job' && (po.offload || []).length === 2, 'delivery to the job address, offload saved: ' + JSON.stringify(po && [po.delivery_to, po.delivery_address, po.offload]));
  await page.waitForTimeout(1500);
  // Since 5 Nov Raise PO opens the email pop-up on the same screen (no separate page).
  check(await page.getByText(/raised — email it?/).count() === 1, 'Raise PO opens the email pop-up');
  const to = await page.locator('input').evaluateAll((els) => els.map((e) => e.value).filter((v) => v.includes('@')));
  check(to.includes('orders@bauder.test'), 'Send PO opens with the supplier’s email: ' + to.join(', '));
  check(to.length >= 0 && (await page.locator('input').evaluateAll((els) => els.map((e) => e.value))).some((v) => /Purchase order J101-PO-001/.test(v)), 'with the PO template filled in');
  await page.screenshot({path:'shots/job/pofull-send-1400.png'});
  // The PO's own page keeps View PO and Send PO.
  await page.goto('http://localhost:8081/fin/po/' + po.id); await page.waitForTimeout(4000);
  check(await page.getByText('👁 View PO').count() === 1 && await page.getByText('✉ Send PO').count() === 1, 'the PO page has View PO and Send PO');
  check(!errs.length, 'no errors ' + errs.slice(0, 2).join(' | '));
  await browser.close(); process.exit(0);
})();
