// BoQ import: lines from a file are saved (by autosave, or by Save Bill of Quantities).
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/boq'); await page.waitForTimeout(6000);
  const names = () => (db.fin_contract_items||[]).filter(i=>i.site_id===S1).map(i=>i.description).join(' / ');
  console.log('before:', names());
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText('📥 Import a breakdown (Excel, CSV or PDF)', {exact:true}).click()]);
  await fc.setFiles('shots/samples/boq.csv'); await page.waitForTimeout(3000);
  await page.getByText('Use this breakdown', {exact:true}).click(); await page.waitForTimeout(800); await page.locator('text="Replace" >> visible=true').last().click(); await page.waitForTimeout(6000);
  console.log('after autosave:', names());
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
