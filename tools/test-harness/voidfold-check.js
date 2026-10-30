// Finance › Sales › Invoices: voided invoices sit in a closed "Voided invoices" drop-down, out of the list and totals.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_invoices = [{id:'i1', org_id:org, site_id:S1, number:'INV-1', status:'sent', issue_date:'2026-10-10', net:1000, vat:200, total:1200, paid_amount:0, created_at:'2026-10-10'},
    {id:'i2', org_id:org, site_id:S1, number:'INV-2', status:'void', issue_date:'2026-10-12', net:500, vat:100, total:600, paid_amount:0, created_at:'2026-10-12'}];
  db.job_finance = [{site_id:S1, org_id:org, contract_value:120000}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/sales?tab=invoices'); await page.waitForTimeout(5000);
  await page.getByText(/^All/).first().click(); await page.waitForTimeout(500);
  let t = await page.evaluate(()=>document.body.innerText);
  console.log('All: INV-2 hidden', !t.includes('INV-2'), '| fold shown', t.includes('Voided invoices (1)'));
  await page.getByText('Voided invoices (1)').click(); await page.waitForTimeout(400);
  t = await page.evaluate(()=>document.body.innerText);
  console.log('opened: INV-2 shown', t.includes('INV-2'));
  await page.screenshot({path:'shots/voidfold.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
