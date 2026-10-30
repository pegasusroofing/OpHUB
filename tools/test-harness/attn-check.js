// Finance project Overview: "Needs attention" lists overdue invoices, purchase invoices to approve, no client PO,
// client not in the Directory — and tapping a row goes there.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const st = db.sites.find(s=>s.id===S1), org = st.org_id; st.client_name = 'Brand New Client';
  db.job_finance = [{site_id:S1, org_id:org, billing_type:'invoice', contract_value:20000}];
  db.fin_invoices = [{id:'i1', org_id:org, site_id:S1, number:'INV-1', status:'issued', issue_date:'2026-08-01', due_date:'2026-08-31', net:1000, vat:200, total:1200, amount_paid:0}];
  db.purchase_invoices = [{id:'p1', org_id:org, site_id:S1, supplier_name:'SIG', invoice_no:'X', status:'to_approve', net:300, vat:60, total:360}];
  db.fin_clients = []; db.client_pos = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1); await page.waitForTimeout(7000);
  for (const t of ['Needs attention', 'Overdue invoices', 'Purchase invoices to approve', 'No client PO', 'Client not in the Directory']) console.log(t, await page.getByText(t, {exact:true}).count());
  await page.screenshot({path:'shots/attn.png', fullPage:true});
  await page.getByText('Client not in the Directory', {exact:true}).click(); await page.waitForTimeout(3000);
  console.log('tap →', page.url().replace('http://localhost:8081',''));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
