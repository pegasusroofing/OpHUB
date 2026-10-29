// Xero settings card (when connected): account codes, tracking, send automatically → saved; Post to Xero on an invoice says the trial is on.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  global.__fn = (name, body) => name === 'xero' && body.action === 'status' ? { connected: true, tenant_name: 'RTB Roofing Ltd' } : { ok: true };
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_settings = [{org_id:org, xero_sales_account:'200'}];
  db.fin_invoices = [{id:'i1', org_id:org, site_id:S1, number:'INV-1', status:'sent', issue_date:'2026-10-05', net:500, vat:100, total:600, lines:[{description:'Works', amount:500}], vat_treatment:'standard', created_at:'2026-10-05'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/settings'); await page.waitForTimeout(5000);
  await page.getByText('Xero', {exact:true}).first().click().catch(()=>{}); await page.waitForTimeout(800);
  const fields = page.locator('input'); 
  await page.getByText('Send to Xero automatically', {exact:false}).click(); await page.waitForTimeout(200);
  await page.screenshot({path:'shots/xero-settings.png', fullPage:true});
  await page.getByText('Save Xero settings').click(); await page.waitForTimeout(1500);
  console.log('settings:', JSON.stringify(db.fin_settings[0]));
  await page.goto(BASE+'/fin/job/'+S1+'/invoice/i1'); await page.waitForTimeout(5000);
  console.log('invoice has Post to Xero:', await page.getByText('Post to Xero', {exact:true}).count());
  await page.getByText('Post to Xero', {exact:true}).click().catch(()=>{}); await page.waitForTimeout(1200);
  console.log('toast:', (await page.evaluate(()=>document.body.innerText)).match(/Xero: [^\n]*/)?.[0] || 'none');
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
