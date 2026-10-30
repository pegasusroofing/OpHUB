// Job COSHH page (manager): Subcontractor COSHH by company with View / Export / Email and "Open <company>'s COSHH".
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); st.acting_as_main_contractor = true;
  db.subcontractor_companies = [{id:'sc1', site_id:S1, org_id:st.org_id, name:'Acme Scaffolding'}];
  db.coshh_docs = [{id:'cd1', site_id:S1, org_id:st.org_id, name:'Diesel', storage_path:'d.pdf', uploaded_at:'2026-10-20T09:00:00Z', subcontractor_company_id:'sc1'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/coshh'); await page.waitForTimeout(6000);
  await page.getByText(/Acme Scaffolding — COSHH \(1\)/).click(); await page.waitForTimeout(500);
  console.log('diesel', await page.getByText('Diesel').count(), '| export', await page.getByText('⬇ Export').count(), '| email', await page.getByText('✉️ Email').count());
  await page.getByText("Open Acme Scaffolding's COSHH").click(); await page.waitForTimeout(3000);
  console.log('open →', page.url().replace('http://localhost:8081','').replace(S1,'S1'));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
