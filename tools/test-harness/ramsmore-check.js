// RAMS page: delete a superseded version, subcontractor RAMS per company, multi-page sign tick on upload.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id, me = db.profiles[0].id;
  db.rams_docs = [
    {id:'r1', site_id:S1, org_id:org, name:'Working at Height v2', storage_path:'a.pdf', status:'current', uploaded_by:me, uploaded_at:'2026-10-20T09:00:00Z', doc_type:'RAMS', subcontractor_company_id:null},
    {id:'r0', site_id:S1, org_id:org, name:'Working at Height v1', storage_path:'b.pdf', status:'superseded', superseded_by:'r1', uploaded_by:me, uploaded_at:'2026-10-01T09:00:00Z', doc_type:'RAMS', subcontractor_company_id:null},
    {id:'rs', site_id:S1, org_id:org, name:'Scaffold erection', storage_path:'c.pdf', status:'current', uploaded_by:me, uploaded_at:'2026-10-21T09:00:00Z', doc_type:'RAMS', subcontractor_company_id:'sc1'},
  ];
  db.subcontractor_companies = [{id:'sc1', site_id:S1, org_id:org, name:'Brothers Scaffold'}];
  db.sign_layout_templates = [{id:'lt1', org_id:org, name:'Two box', layout:{boxes:[{page:1,x:1,y:1,w:10,h:5}]}}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/hs/rams'); await page.waitForTimeout(6000);
  await page.getByText(/Brothers Scaffold — RAMS \(1\)/).click(); await page.waitForTimeout(400);
  console.log('sub RAMS shown:', await page.getByText('Scaffold erection').count());
  await page.getByText(/Superseded Documents \(1\)/).click(); await page.waitForTimeout(400);
  await page.getByLabel('Delete superseded version').click(); await page.waitForTimeout(500);
  await page.getByText('Delete', {exact:true}).last().click(); await page.waitForTimeout(1500);
  console.log('superseded left:', db.rams_docs.filter(r=>r.status==='superseded').length);
  await page.getByText(/^Create \/ Upload RAMS$/).click(); await page.waitForTimeout(400);
  await page.getByText('📄 Upload RAMS').click(); await page.waitForTimeout(400);
  const before = await page.getByText(/Signing template:/).count();
  await page.getByText('Multi-page sign required').click(); await page.waitForTimeout(300);
  console.log('template picker hidden until ticked:', before === 0, '| after tick:', await page.getByText(/Signing template:/).count());
  await page.screenshot({path:'shots/ramsmore.png', fullPage:true});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
