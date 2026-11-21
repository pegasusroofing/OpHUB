// Bill to: picked from the Directory on Project details (address / email follow), and a Directory change carries to the project.
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
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
  await page.getByText('Project Settings', {exact:true}).first().click(); await page.waitForTimeout(1500);
  // Edit ▾ › Edit Project Financials; the Client box picks from the Directory.
  await page.getByText('Edit ▾', {exact:true}).first().click(); await page.waitForTimeout(600);
  await page.locator('text="Edit Project Financials" >> visible=true').last().click(); await page.waitForTimeout(1200);
  await page.locator('text=/^Not set/ >> visible=true').first().click(); await page.waitForTimeout(500);
  await page.locator('text="Bellway Homes" >> visible=true').last().click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/billto.png'});
  await page.locator('text="Save" >> visible=true').last().click(); await page.waitForTimeout(2500);
  const jf = db.job_finance[0];
  check(jf.billing_name === 'Bellway Homes' && jf.billing_email === 'accounts@bellway.test' && /1 Bellway Rd/.test(jf.billing_address || '') && /NE1 1AA/.test(jf.billing_address || ''), `picking the Directory client fills the bill-to name, email and address (${JSON.stringify([jf.billing_name, jf.billing_email, jf.billing_address])})`);
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0,400)}`);
  await browser.close();
})();
