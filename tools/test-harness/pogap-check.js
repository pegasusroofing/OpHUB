// Summary: a manual cost line opens its editor. Finance settings: PO on/off and VAT on new PO lines save.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_job_costs = [{id:'k1', org_id:org, site_id:S1, category:'labour', cost_date:'2026-10-01', description:'Labour October', supplier:'Biffa', net:250}];
  db.fin_settings = [{org_id:org, po_enabled:false, po_vat_default:'20', invoice_prefix:'INV-', next_invoice_number:1, default_retention_pct:5}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/summary'); await page.waitForTimeout(6000);
  for (const t of ['Labour & Subcontractors']) if (!(await page.getByText('Labour October').count())) { await page.getByText(t, {exact:true}).last().click({timeout:3000}).catch(()=>{}); await page.waitForTimeout(1200); }
  await page.getByText('Labour October').first().click({timeout:5000}); await page.waitForTimeout(4000);
  console.log('cost line went to', page.url().split('8081')[1].replace(S1,'S1'));
  console.log('editor open', await page.locator('input').evaluateAll((els)=>els.some((e)=>e.value==='Labour October')));
  await page.screenshot({path:'shots/pogap-cost.png'});
  await page.goto('http://localhost:8081/fin/settings'); await page.waitForTimeout(6000);
  // Each part of Settings opens on its own with its own Edit (2 Nov): open Purchase orders, then Edit.
  await page.getByText('Purchase orders', {exact:true}).last().click(); await page.waitForTimeout(800);
  await page.locator('text="Edit" >> visible=true').last().click(); await page.waitForTimeout(1500);
  await page.getByText('Raise a PO for every PM’s order').last().click(); await page.waitForTimeout(500);
  await page.screenshot({path:'shots/pogap-settings.png', fullPage:false});
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(3000);
  const st = db.fin_settings[0];
  console.log('saved', st.po_enabled, st.po_vat_default);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})().catch((e)=>{ console.log('STOPPED', e.message.slice(0,300)); process.exit(1); });
