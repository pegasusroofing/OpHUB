// Manager's H&S page: RAMS shows "!" when an assigned operative hasn't signed; PPE shows pending requests; incidents and briefings counted.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1), org = db.profiles[0].org_id;
  db.rams_docs = [{id:'r1', site_id:S1, org_id:org, name:'Working at Height', storage_path:'a.pdf', status:'current', uploaded_at:'2026-10-20T09:00:00Z', subcontractor_company_id:null}];
  db.rams_signatures = [];
  db.ppe_requests = [{id:'pr1', site_id:S1, user_id:'o1', item_name:'Gloves', status:'pending', created_at:'2026-10-29T08:00:00Z'}];
  db.incident_reports = [{id:'i1', site_id:S1, org_id:org, created_at:'2026-10-20T09:00:00Z'}, {id:'i2', site_id:S1, org_id:org, created_at:'2026-10-21T09:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs'); await page.waitForTimeout(7000);
  console.log('ppe sub', await page.getByText('1 request').count(), '| incidents', await page.getByText('2 filed').count(), '| briefings none', await page.getByText('None yet').count(), '| ! badge', await page.getByText('!', {exact:true}).count());
  await page.screenshot({path:'shots/hstiles.png'});
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
