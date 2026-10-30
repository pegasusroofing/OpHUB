// Repair-contract job, Finance user: "Which repair job?" on Request material → the request carries repair_job_id.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const st = db.sites.find(s=>s.id===S1); st.repair_contract = true;
  db.repair_jobs = [{id:'rj1', site_id:S1, job_number:'RJ-101', address:'5 High St', closed:false, created_at:'2026-10-20T09:00:00Z'}];
  db.materials = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/materials/requests'); await page.waitForTimeout(6000);
  await page.getByText(/General \/ not for one job — ▾/).click(); await page.waitForTimeout(500);
  await page.locator('text="RJ-101 — 5 High St" >> visible=true').last().click(); await page.waitForTimeout(300);
  await page.getByPlaceholder('Item').fill('Ridge tiles'); await page.getByPlaceholder('Quantity').fill('20');
  await page.getByText('Request Material Order').click(); await page.waitForTimeout(3000);
  console.log(JSON.stringify(db.materials.map(m=>({item:m.item, rj:m.repair_job_id, lbl:m.sub_site_label}))));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
