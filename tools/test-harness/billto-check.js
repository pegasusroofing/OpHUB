// Bill to: picked from the Directory on Project details (address / email follow), and a Directory change carries to the project.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_clients = [{id:'c1', org_id:org, name:'Bellway Homes', email:'accounts@bellway.test', address:'1 Bellway Rd', postcode:'NE1 1AA'}];
  db.job_finance = [{site_id:S1, org_id:org, billing_type:'invoice', contract_value:10000}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/job/'+S1); await page.waitForTimeout(5000);
  await page.getByText('Project Admin', {exact:true}).first().click(); await page.waitForTimeout(1500);
  await page.getByText(/^Edit/).first().click().catch(()=>{}); await page.waitForTimeout(1000);
  const sel = page.getByText('Not set ▾'); if (await sel.count()) { await sel.first().click(); } await page.waitForTimeout(400);
  await page.getByText('Bellway Homes', {exact:true}).last().click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/billto.png'});
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(2500);
  console.log('after project save:', JSON.stringify(db.job_finance[0].billing_name), JSON.stringify(db.job_finance[0].billing_email), JSON.stringify(db.job_finance[0].billing_address));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
