// Older Schedule of Works photo with no small copies: opening the job makes and records them.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = []; const calls = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  await ctx.route('**/rest/v1/rpc/set_schedule_photo_renditions', async (route) => { calls.push(JSON.parse(route.request().postData()||'{}')); route.fulfill({status:200, contentType:'application/json', body:'null'}); });
  db.profiles[0].howto_dismissed = ['*'];
  db.schedule_tasks = [{id:'t1', site_id:S1, name:'Strip roof', status:'done', position:0}];
  db.schedule_photos = [{id:'p1', task_id:'t1', storage_path:S1+'/schedule/t1/old.jpg', mid_path:null, thumb_path:null, uploaded_by:'me', uploaded_at:'2026-01-01T09:00:00Z', stage:'done', schedule_tasks:{site_id:S1}}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(9000);
  console.log('renditions recorded:', JSON.stringify(calls));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
