// Small rules: Off-hire today; the LOLER page refuses a non-LOLER report; repair job shows who signed it off.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const st = db.sites.find(s=>s.id===S1), org = st.org_id; st.repair_contract = true;
  db.fin_plant_hires = [{id:'h1', org_id:org, site_id:S1, item:'Cherry picker', on_hire:'2026-09-01', off_hire:null, rate:300, rate_period:'week'}];
  db.report_templates = [{id:'tp1', org_id:org, name:'Daily report', is_loler_inspection:false, archived:false, sections:[]}];
  db.report_submissions = [{id:'rs1', site_id:S1, org_id:org, template_id:'tp1', template_name:'Daily report', status:'completed', answers:{}, created_at:'2026-10-20T09:00:00Z'}];
  db.repair_jobs = [{id:'rj1', site_id:S1, job_number:'RJ-1', address:'5 High St', closed:true, closed_at:'2026-10-21T09:00:00Z', closed_by:'o1', invoiced:false, job_status:'Completed', survey_required:'N', survey_status:'N/A', quote_approved:true, works_completed:true, works_completed_date:'2026-10-20', created_at:'2026-10-01T09:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/plant/h1'); await page.waitForTimeout(5000);
  await page.getByText('Off-hire today').click(); await page.waitForTimeout(2500);
  console.log('off hire set', !!db.fin_plant_hires[0].off_hire);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/loler/view/rs1'); await page.waitForTimeout(5000);
  console.log('non-LOLER refused', await page.getByText('Inspection not found.').count());
  await page.goto('http://localhost:8081/sites/'+S1+'/repairs/job/rj1'); await page.waitForTimeout(5000);
  console.log('signed off line', (await page.evaluate(()=>document.body.innerText)).match(/Signed off[^\n]*/)?.[0] || 'none');
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
