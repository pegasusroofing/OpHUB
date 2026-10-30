// Schedule of Works Email Report: tick PMs / admins (you ticked first), add another address.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = []; let sent = null;
  global.__fn = (name, body) => { console.log('fn', name); if (name === 'send-schedule-email') { sent = body; return {ok:true}; } };
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.schedule_tasks = [{id:'t1', site_id:S1, name:'Strip roof', status:'todo', position:0}];
  db.profiles.push({id:'pm2', org_id:org, name:'Pete Manager', email:'pete@rtb.co', role:'pm'});
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(5000);
  await page.getByText('✉ Email Report').click(); await page.waitForTimeout(800);
  await page.getByText(/Pete Manager/).click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/sowemail.png'});
  await page.getByText('Send', {exact:true}).last().click(); await page.waitForTimeout(600);
  console.log('period ask:', await page.getByText(/^Full project/).count()); await page.getByText(/^Full project/).click(); await page.waitForTimeout(8000);
  await page.screenshot({path:'shots/sowemail2.png'});
  console.log('recipients:', sent && JSON.stringify(sent.recipients));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
