// Finance lists: month picker on Sales invoices, Value box on Projects, month on Purchases.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id, S2 = db.sites[1].id;
  db.fin_invoices = [{id:'i1', org_id:org, site_id:S1, number:'INV-1', status:'sent', issue_date:'2026-09-10', net:1000, vat:200, total:1200, paid_amount:0, created_at:'2026-09-10'},{id:'i2', org_id:org, site_id:S1, number:'INV-2', status:'sent', issue_date:'2026-10-05', net:500, vat:100, total:600, paid_amount:0, created_at:'2026-10-05'}];
  db.job_finance = [{site_id:S1, org_id:org, contract_value:120000},{site_id:S2, org_id:org, contract_value:30000}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/sales?tab=invoices'); await page.waitForTimeout(5000);
  const before = (await page.evaluate(()=>document.body.innerText)).includes('INV-1');
  await page.getByLabel('Month', {exact: true}).click(); await page.waitForTimeout(400); await page.getByText('Oct 2026', {exact:true}).last().click(); await page.waitForTimeout(800);
  const t = await page.evaluate(()=>document.body.innerText);
  console.log('sales month: before INV-1', before, '| after Oct: INV-1', t.includes('INV-1'), 'INV-2', t.includes('INV-2'));
  await page.screenshot({path:'shots/fin-sales-month.png'});
  await page.goto(BASE+'/fin/jobs'); await page.waitForTimeout(5000);
  await page.getByPlaceholder('Value e.g. >50k, 25k-100k').fill('>100k'); await page.waitForTimeout(600);
  const j = await page.evaluate(()=>document.body.innerText);
  console.log('projects >100k:', db.sites.map(s=>s.name+':'+j.includes(s.name)).join(' '));
  await page.screenshot({path:'shots/fin-jobs-value.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
