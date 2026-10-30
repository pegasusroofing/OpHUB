// Reports kept on the phone show as "waiting to send" on the Reports page; Send now sends them.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.report_templates = [{id:'tp1', org_id:db.profiles[0].org_id, name:'Roof survey', archived:false, sections:[{id:'s1', title:'Roof', items:[{id:'q1', type:'text', label:'Ridge'}]}]}];
  db.report_submissions = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/snagging/reports'); await page.waitForTimeout(5000);
  const block = r => r.abort('internetdisconnected');
  await page.route('**/rest/v1/report_submissions**', block);
  await page.getByText('+ New Report', {exact:true}).click(); await page.waitForTimeout(1500);
  await page.getByText('Start', {exact:true}).first().click(); await page.waitForTimeout(5000);
  await page.locator('textarea, input').first().fill('Ridge tiles loose');
  await page.getByText('Save & Exit', {exact:true}).click(); await page.waitForTimeout(4000);
  await page.goto(BASE+'/sites/'+S1+'/snagging/reports'); await page.waitForTimeout(4000);
  console.log('waiting card:', (await page.evaluate(()=>document.body.innerText)).includes('waiting to send'));
  await page.screenshot({path:'shots/waiting.png'});
  await page.unroute('**/rest/v1/report_submissions**', block);
  await page.getByText('Send now', {exact:true}).click(); await page.waitForTimeout(5000);
  console.log('server after Send now:', JSON.stringify(db.report_submissions.map(r=>[r.template_name, r.answers])), '| card gone:', !(await page.evaluate(()=>document.body.innerText)).includes('waiting to send'));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
