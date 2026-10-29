// New subcontractor PO: from the workers list, two priced lines, into the Price file as an issued sheet.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_labour_rates = [{id:'w1', org_id:org, user_id:null, name:'Dave Lead', trading_name:'DL Leadwork Ltd', email:'dave@dl.test', utr:'1234567890', cis_rate:20, vat_registered:false, active:true}];
  db.fin_subcontracts = []; db.pricing_elements = []; db.price_builder_sheets = []; db.price_builder_sheet_items = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/sub/new?site='+S1); await page.waitForTimeout(5000);
  await page.getByLabel('From your workers list (optional)').click(); await page.waitForTimeout(400); await page.getByText('DL Leadwork Ltd', {exact:true}).last().click(); await page.waitForTimeout(800);
  await page.getByText('+ Add a line').click(); await page.waitForTimeout(600); await page.getByText('+ Add a line').click(); await page.waitForTimeout(300);
  const items = page.getByPlaceholder('Item'), qty = page.getByPlaceholder('Qty'), rate = page.getByPlaceholder('Rate £');
  await items.nth(0).fill('Lead valleys'); await qty.nth(0).fill('20'); await rate.nth(0).fill('45');
  await items.nth(1).fill('Abutment flashing'); await qty.nth(1).fill('10'); await rate.nth(1).fill('30');
  const inputs = page.locator('textarea'); if (await inputs.count()) await inputs.first().fill('Leadwork to valleys');
  await page.screenshot({path:'shots/subnew.png', fullPage:true});
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(4000);
  console.log('order:', JSON.stringify(db.fin_subcontracts.map(s=>({n:s.number, name:s.name, worker:s.worker_id, val:s.order_value, utr:s.utr, sheet:!!s.price_sheet_id}))));
  console.log('sheet:', JSON.stringify(db.price_builder_sheets.map(s=>[s.title, s.status, s.total])), 'items', db.price_builder_sheet_items.length, 'tiles', db.pricing_elements.map(e=>e.name+':'+e.price_total).join(','));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
