// Purchase invoice (5 Nov 2026; 6 Nov: it opens ready to change): put line 2 on another project with another cost type, Save → the
// cost is split across the two projects (this replaces the old Code each line box).
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id, S2 = db.sites[1].id;
  db.purchase_invoices = [{id:'pi1', org_id:org, site_id:S1, supplier_name:'Jewson', invoice_no:'INV-9', invoice_date:'2026-10-20', net:300, vat:60, total:360, status:'to_approve', cost_code:'materials', lines:[{description:'Slates', qty:1, unit_price:200, amount:200, site_id:S1, cost_code:'materials', vat_rate:20}, {description:'Scaffold hire', qty:1, unit_price:100, amount:100, site_id:S1, cost_code:'materials', vat_rate:20}]}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/pinv/pi1'); await page.waitForTimeout(5000);
  await page.getByText('✏️ Edit', {exact:true}).click(); await page.waitForTimeout(400); // a saved invoice opens locked
  await page.getByLabel('Line 2 job').click(); await page.waitForTimeout(500);
  await page.getByText(new RegExp(db.sites[1].name)).last().click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 2 cost code').click(); await page.waitForTimeout(400); await page.getByText('Plant', {exact:true}).last().click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/picode.png', fullPage:true});
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(2500);
  const p = db.purchase_invoices[0];
  const ok = Array.isArray(p.split) && p.split.length === 2 && p.split.some((x) => x.site_id === S2 && x.cost_code === 'plant');
  console.log((ok ? 'PASS' : 'FAIL') + ' split:', JSON.stringify(p.split), '| lines:', JSON.stringify(p.lines.map(l=>[l.site_id===S1?'S1':l.site_id===S2?'S2':l.site_id, l.cost_code])));
  if (!ok) process.exitCode = 1;
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close();
})();
