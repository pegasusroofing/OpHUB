// Finance › Directory › Labour: a sign-up form applicant not in the directory → "Add to directory" makes their CIS record.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.fin_labour_rates = [];
  db.subcontractor_applications = [{id:'ap1', org_id:org, user_id:null, company_name:'Acme Roofing Ltd', contact_name:'Sam Acme', email:'sam@acme.co', phone:'0700', status:'new', created_at:'2026-10-25T09:00:00Z', data:{utr:'12345 67890', cis_status:'Gross payment', company_type:'Limited company', trades:['Slating','Leadwork']}}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/directory?kind=labour'); await page.waitForTimeout(6000);
  console.log('waiting shown', await page.getByText(/1 from the sub-contractor sign-up form/).count());
  await page.getByText('Add to directory').click(); await page.waitForTimeout(3000);
  console.log(JSON.stringify(db.fin_labour_rates.map(r=>({name:r.name, trading:r.trading_name, utr:r.utr, cis:r.cis_rate, reg:r.cis_reg_type, app:r.application_id, notes:r.notes}))));
  console.log('waiting after', await page.getByText(/from the sub-contractor sign-up form/).count());
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
