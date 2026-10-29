// Finance › New PO with typed lines: supplier (new one), two lines with cost code and VAT, Raise PO → numbered PO with value, VAT and total.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.suppliers = [{id:'s1', org_id:org, name:'Jewson', email:'j@x.test'}]; db.purchase_orders = [];
  await ctx.route('**/rest/v1/rpc/fin_new_po', async (r) => { const b = JSON.parse(r.request().postData()||'{}'); const id = 'po-new-1'; db.purchase_orders.push({id, org_id:org, site_id:b.p_site, number:'J101-PO-001', supplier_id:b.p_supplier_id, supplier_name:b.p_supplier_name, items:b.p_items, required_by:b.p_required, fulfilment:b.p_delivery, note:b.p_note, value:b.p_items.reduce((t,x)=>t+x.amount,0), status:'open', created_at:new Date().toISOString(), source:'finance'}); r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({id, number:'J101-PO-001'})}); });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/po/new?site='+S1); await page.waitForTimeout(5000);
  await page.getByPlaceholder('Type to find a supplier, or a new name').fill('Roofing Supplies Ltd');
  await page.getByPlaceholder("Supplier's orders email (optional)").fill('orders@rsl.test');
  await page.getByPlaceholder('Description').fill('Slates 500x250'); await page.getByPlaceholder('Qty').fill('400'); await page.getByPlaceholder('Rate £').fill('1.25');
  await page.getByText('+ Add line').click(); await page.waitForTimeout(300);
  await page.getByPlaceholder('Description').nth(1).fill('Lead code 4'); await page.getByPlaceholder('Rate £').nth(1).fill('85');
  await page.screenshot({path:'shots/newpo.png', fullPage:true});
  await page.getByText('Raise PO', {exact:true}).click(); await page.waitForTimeout(5000);
  console.log('url:', page.url().replace(BASE,''));
  console.log('po:', JSON.stringify(db.purchase_orders.map(p=>({n:p.number, sup:p.supplier_name, value:p.value, vat:p.vat, total:p.total, items:p.items.map(i=>[i.item,i.qty,i.amount,i.vat_rate,i.vat])}))));
  console.log('suppliers:', db.suppliers.map(s=>s.name).join(', '));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
