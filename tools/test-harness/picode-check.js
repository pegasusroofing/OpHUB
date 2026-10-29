// Purchase invoice: code each line to a project and cost type → split saved across projects.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id, S2 = db.sites[1].id;
  db.purchase_invoices = [{id:'pi1', org_id:org, site_id:S1, supplier_name:'Jewson', invoice_no:'INV-9', invoice_date:'2026-10-20', net:300, vat:60, total:360, status:'to_approve', cost_code:'materials', lines:[{description:'Slates', amount:200},{description:'Skip hire', amount:100},{kind:'total', amount:300}], created_at:new Date().toISOString()}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/pinv/pi1'); await page.waitForTimeout(5000);
  await page.getByText(/Code each line/).first().click(); await page.waitForTimeout(500);
  await page.getByLabel('Project').nth(1).click(); await page.waitForTimeout(400);
  const opt = page.getByText(new RegExp(db.sites[1].name)).last(); await opt.click(); await page.waitForTimeout(300);
  await page.getByLabel('Cost type').nth(1).click(); await page.waitForTimeout(400); await page.getByText('Plant', {exact:true}).last().click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/picode.png', fullPage:true});
  await page.getByText('Save coding').click(); await page.waitForTimeout(2500);
  const p = db.purchase_invoices[0];
  console.log('split:', JSON.stringify(p.split), '| lines:', JSON.stringify(p.lines.map(l=>[l.site_id===S1?'S1':l.site_id===S2?'S2':l.site_id, l.cost_code])));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
