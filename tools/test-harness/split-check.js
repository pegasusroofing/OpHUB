// Costs ledger → a cost → "Change split" opens the split box; share evenly across plots and save.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex5')(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/job/'+S1+'/costs'); await page.waitForTimeout(5000);
  await page.getByText('Scaffold hire', {exact:true}).first().click(); await page.waitForTimeout(1500);
  await page.getByText('Allocate / split', {exact:true}).click(); await page.waitForTimeout(1500);
  await page.getByText('Across all plots & addresses', {exact:true}).click(); await page.waitForTimeout(500);
  await page.screenshot({path:'shots/native_split-1300.png'});
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(2000);
  console.log('saved split', JSON.stringify(db.fin_job_costs.find(c=>c.id==='c4').split), 'sub', db.fin_job_costs.find(c=>c.id==='c4').sub_job_id);
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
