// Book Stock Into The Yard: Finance "Book stock in" opens the full form; pick a PO (fills supplier + ref) → yard_moves row has po_id.
// Materials (manager) has a "⬇ Book into yard" tab.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.yard_stock = [{id:'y1', org_id:org, item:'Slates', unit:'pcs', qty:100, active:true}];
  db.yard_moves = [];
  db.purchase_orders = [{id:'po1', org_id:org, number:'J101-PO-004', supplier_name:'SIG', status:'open', created_at:'2026-10-29T08:00:00Z'},
                        {id:'po2', org_id:org, number:'J101-PO-001', supplier_name:'Old', status:'cancelled', created_at:'2026-10-20T08:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/yard'); await page.waitForTimeout(5000);
  await page.getByText('⬇ Book stock in', {exact:true}).first().click(); await page.waitForTimeout(4000);
  console.log('url:', page.url().replace(BASE,''));
  await page.locator('text=/^Slates/ >> visible=true').first().click(); await page.waitForTimeout(300);
  await page.locator('input[placeholder="Qty, e.g. 40"] >> visible=true').fill('40');
  await page.locator('text=▼ None >> visible=true').click(); await page.waitForTimeout(300);
  console.log('cancelled PO listed:', await page.getByText('J101-PO-001').count());
  await page.locator('text=J101-PO-004 >> visible=true').first().click(); await page.waitForTimeout(300);
  console.log('supplier/ref filled:', await page.locator('input[placeholder="From (supplier)"] >> visible=true').inputValue(), '/', await page.locator('input[placeholder="PO or delivery note number"] >> visible=true').inputValue());
  await page.screenshot({path:'shots/yardin.png'});
  await page.locator('text="Book In" >> visible=true').click(); await page.waitForTimeout(2500);
  console.log('move:', JSON.stringify(db.yard_moves.map(m=>({k:m.kind, q:m.qty, po:m.po_id, ref:m.ref, sup:m.supplier_name}))));
  await page.goto(BASE+'/sites/'+S1+'/materials/requests'); await page.waitForTimeout(5000);
  const t = page.getByText('⬇ Book into yard'); console.log('materials tab:', await t.count());
  if (await t.count()) { await t.first().click(); await page.waitForTimeout(3000); console.log('url2:', page.url().replace(BASE,'')); }
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
