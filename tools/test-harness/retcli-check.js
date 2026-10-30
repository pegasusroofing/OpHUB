// Project Admin: change the client → added to the Directory and becomes the bill-to. Retention half already
// in an application shows "In Application N".
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_clients = [{id:'c1', org_id:org, name:'Old Client Ltd'}];
  db.fin_applications = [{id:'ap1', org_id:org, site_id:S1, number:3, status:'draft', app_date:'2026-10-30', lines:[], variations:[], dayworks:[]}];
  db.job_finance = [{site_id:S1, org_id:org, billing_type:'application', billing_name:'Old Client Ltd', ret1_app_id:'ap1', contract_value:10000, retention_pct:5}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1); await page.waitForTimeout(7000);
  console.log('retention in app:', await page.getByText(/In Application 3/).count());
  await page.screenshot({path:'shots/retcli.png', fullPage:true});
  await page.goto('http://localhost:8081/fin/job/'+S1+'?tab=admin'); await page.waitForTimeout(6000);
  await page.getByText(/✎ Project — name, client/).first().click(); await page.waitForTimeout(800);
  const cb = page.locator('text="Client"').locator('xpath=following::input[1]');
  await cb.fill('New Client Ltd'); await page.locator('text="Save" >> visible=true').last().click(); await page.waitForTimeout(3000);
  console.log('clients', db.fin_clients.map(c=>c.name).join(', '), '| bill to', db.job_finance[0].billing_name, '| site client', db.sites.find(s=>s.id===S1).client_name);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
