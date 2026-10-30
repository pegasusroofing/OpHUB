// Deleting an unfinished Daily Briefing is written to the job's Activity History.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.report_templates = [{id:'bt', org_id:org, name:'Daily Briefing', sections:[], is_daily_briefing:true, archived:false}];
  db.report_submissions = [{id:'bs1', site_id:S1, org_id:org, template_id:'bt', template_name:'Daily Briefing', status:'in_progress', submitted_by:'me', submitted_at:new Date().toISOString(), created_at:new Date().toISOString(), answers:{}, sections:[]}];
  db.site_activity_log = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/hs/briefings'); await page.waitForTimeout(5000);
  await page.getByText('🗑').first().click(); await page.waitForTimeout(400);
  await page.getByText('Delete', {exact:true}).last().click(); await page.waitForTimeout(1500);
  console.log('deleted:', !db.report_submissions.length, '| logged:', JSON.stringify(db.site_activity_log.map(l=>l.description)));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
