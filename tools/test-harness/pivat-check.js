// Add a purchase invoice by hand on the line-by-line screen (5 Nov 2026): a PO picked → linked; a net line at 20% →
// VAT and total worked out. (Replaces the old Net / Total form test.)
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_suppliers = [{id:'fs1', org_id:org, name:'SIG'}];
  db.purchase_orders = [{id:'po1', org_id:org, site_id:S1, number:'J101-PO-004', supplier_name:'SIG', status:'open', value:500, created_at:'2026-10-29T08:00:00Z', items:[]}];
  db.purchase_invoices = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/pinv/new?site='+S1); await page.waitForTimeout(5000);
  await page.getByLabel('Supplier', {exact:true}).last().click(); await page.waitForTimeout(400); await page.getByText('SIG', {exact:true}).last().click();
  await page.getByLabel('Invoice number').fill('INV-1');
  await page.getByLabel('Allocate To PO', {exact:true}).last().click(); await page.waitForTimeout(400); await page.getByText(/J101-PO-004/).last().click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 1 description').fill('Materials'); await page.getByLabel('Line 1 unit price').fill('100');
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(3000);
  const p = db.purchase_invoices[0];
  const ok = p && Number(p.net) === 100 && Number(p.vat) === 20 && Number(p.total) === 120 && p.po_id === 'po1';
  console.log((ok ? 'PASS ' : 'FAIL ') + JSON.stringify(db.purchase_invoices.map(x=>({no:x.invoice_no, net:x.net, vat:x.vat, total:x.total, po:x.po_id||null}))));
  if (!ok) process.exitCode = 1;
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close();
})();
