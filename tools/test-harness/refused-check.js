// The database's rules refuse a delete without an error (0 rows back): the app must say it couldn't
// delete, and must NOT remove the job's files from storage. Then allowed: deleted and files removed.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const site = db.sites.find(s=>s.id===S1); site.repair_contract = true;
  db.repair_jobs = [{id:'rj1', site_id:S1, job_number:'RJ-101', address:'5 High St', description:'Leak', created_at:'2026-10-20T09:00:00Z', work_order_path:'o/repairjobs/rj1/workorder/x-wo.pdf', work_order_name:'WO 101.pdf'}];
  db.repair_job_photos = [];
  let refuse = true; const removed = [];
  await ctx.route('**/rest/v1/repair_jobs?*', async (r) => { if (r.request().method()==='DELETE' && refuse) return r.fulfill({status:200, contentType:'application/json', body:'[]'}); return r.fallback(); });
  await ctx.route('**/storage/v1/object/site-photos', async (r) => { if (r.request().method()==='DELETE') removed.push(r.request().postData()); return r.fulfill({status:200, contentType:'application/json', body:'[]'}); });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  const del = async () => {
    await page.goto(BASE+'/sites/'+S1+'/repairs/job/rj1'); await page.waitForTimeout(6000);
    await page.locator('text="Delete Job" >> visible=true').click(); await page.waitForTimeout(500);
    await page.locator('text="Delete" >> visible=true').last().click(); await page.waitForTimeout(2500);
  };
  await del();
  console.log('refused: toast', await page.getByText('Could not delete — try again.').count(), '| job kept', db.repair_jobs.length, '| files removed', removed.length);
  refuse = false; await del();
  console.log('allowed: job left', db.repair_jobs.length, '| files removed', removed.length);
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
