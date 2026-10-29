// To Do list (calendar from today, date on the right, bigger text) and Project settings (slim bars, status drop-down).
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id, d = new Date(Date.now()+5*864e5).toISOString().slice(0,10);
  db.todos = [{id:'td1', org_id:org, site_id:S1, text:'Chase scaffold handover cert', done:false, assigned_to:db.profiles[0].id, date_required_by:d, created_at:new Date().toISOString()}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/todos'); await page.waitForTimeout(5000);
  await page.getByText('Chase scaffold handover cert').waitFor(); await page.waitForTimeout(500);
  await page.screenshot({path:'shots/td-1.png', fullPage:true});
  await page.getByText('Required by (optional)').last().click(); await page.waitForTimeout(600);
  await page.screenshot({path:'shots/td-2-cal.png'});
  await page.keyboard.press('Escape');
  await page.goto(BASE+'/sites/'+S1+'/admin'); await page.waitForTimeout(5000);
  await page.screenshot({path:'shots/adm-1.png', fullPage:true});
  await page.getByLabel('Job status').click(); await page.waitForTimeout(600);
  await page.screenshot({path:'shots/adm-2-status.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
