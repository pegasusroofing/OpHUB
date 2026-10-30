// Project costs ledger: search narrows the list, sort Biggest, Excel downloads.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_job_costs = [{id:'k1', org_id:org, site_id:S1, category:'overheads', cost_date:'2026-10-01', description:'Skip hire', supplier:'Biffa', net:250},
                      {id:'k2', org_id:org, site_id:S1, category:'overheads', cost_date:'2026-10-10', description:'Fuel', supplier:'Shell', net:80}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/costs'); await page.waitForTimeout(6000);
  console.log('before', await page.getByText('Skip hire').count(), await page.getByText('Fuel').count());
  await page.getByPlaceholder('Search description, supplier or ref').fill('biffa'); await page.waitForTimeout(500);
  console.log('search biffa', await page.getByText('Skip hire').count(), await page.getByText('Fuel', {exact:true}).count());
  const dl = page.waitForEvent('download', {timeout:15000}).catch(()=>null);
  await page.getByText('📊 Excel').click(); const d = await dl; console.log('excel', d ? d.suggestedFilename() : 'none');
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
