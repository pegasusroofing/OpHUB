// Purchase invoices › To approve: tick all, Approve — they're approved and the PO closes if covered.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  db.purchase_invoices.push({id:'pi9',org_id:O,site_id:S1,supplier_name:'Jewson',invoice_no:'J-1',invoice_date:'2026-10-20',net:100,vat:20,total:120,status:'to_approve'});
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); page.on('dialog', d=>d.accept());
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/purchases?tab=invoices'); await page.waitForTimeout(5000);
  const ta = page.getByText(/^To approve/); if(await ta.count()) await ta.first().click(); await page.waitForTimeout(800);
  await page.getByText('☐ Tick all').click(); await page.waitForTimeout(500);
  await page.screenshot({path:'shots/native_pibulk-1300.png'});
  await page.getByText(/^✓ Approve/).click(); await page.waitForTimeout(4000);
  console.log('statuses', JSON.stringify(db.purchase_invoices.map(i=>[i.invoice_no,i.status])));
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
