// Add a purchase invoice by hand: Net only → VAT 20% and total; Total only → net and VAT backed out; PO picked → linked.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.purchase_orders = [{id:'po1', org_id:org, site_id:S1, number:'J101-PO-004', supplier_name:'SIG', status:'open', value:500, created_at:'2026-10-29T08:00:00Z', items:[]}];
  db.purchase_invoices = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  const add = async (no, net, total, pickPo) => {
    await page.goto('http://localhost:8081/fin/pinv/new?site='+S1); await page.waitForTimeout(5000); 
    const inputs = page.locator('input >> visible=true');
    if (pickPo) { await page.locator('text=/^Choose…/ >> visible=true').first().click(); await page.waitForTimeout(400); await page.locator('text=/J101-PO-004/ >> visible=true').last().click(); await page.waitForTimeout(300); }
    const box = (label) => page.locator(`text="${label}"`).locator('xpath=following::input[1]');
    await box('Supplier').fill('SIG'); await box('Invoice number').fill(no);
    if (net) await box('Net £ (blank = worked out from the total)').fill(net);
    if (total) await box('Total £ (blank = net + VAT)').fill(total);
    await page.locator('text="Save" >> visible=true').last().click(); await page.waitForTimeout(3000);
  };
  await add('INV-1', '100', '', true);
  await add('INV-2', '', '240', false);
  console.log(JSON.stringify(db.purchase_invoices.map(p=>({no:p.invoice_no, net:p.net, vat:p.vat, total:p.total, po:p.po_id||null}))));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
