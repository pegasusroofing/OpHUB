// Repair job → OneDrive: an unsent photo goes when the job opens; "Send everything" sends photos + work order.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = []; const calls = [];
  global.__fn = (name, b)=>{ if(name==='onedrive-upload') calls.push((b.filename||'')+' → '+(b.folder_id||b.site_id)); return {ok:true}; };
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const site = db.sites.find(s=>s.id===S1); site.repair_contract = true; site.onedrive_folder_id = 'SITEFOLDER';
  db.repair_jobs = [{id:'rj1', site_id:S1, job_number:'RJ-101', address:'5 High St', description:'Leak', created_at:'2026-10-20T09:00:00Z', survey_required:'Y', work_order_path:'o/repairjobs/rj1/workorder/x-wo.pdf', work_order_name:'WO 101.pdf'}];
  db.repair_job_photos = [{id:'ph1', repair_job_id:'rj1', category:'survey', storage_path:'o/repairjobs/rj1/survey/abc.jpg', created_at:'2026-10-20T10:00:00Z', deleted_at:null, onedrive_synced_at:null}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/repairs/job/rj1'); await page.waitForTimeout(6000);
  console.log('on open:', JSON.stringify(calls)); calls.length = 0;
  await page.getByText('☁️ Send everything on this job to OneDrive', {exact:true}).click(); await page.waitForTimeout(9000);
  console.log('send everything:', JSON.stringify(calls));
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
