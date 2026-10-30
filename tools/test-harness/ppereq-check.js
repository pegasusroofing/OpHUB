// PPE Requests (manager): tick a request → Export 1 (PDF) downloads; Email 1 sends one attachment.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.ppe_requests = [{id:'pr1', site_id:S1, user_id:'o1', item_name:'Hard hat', status:'pending', date_needed:'2026-11-02', created_at:'2026-10-29T08:00:00Z'},
                     {id:'pr2', site_id:S1, user_id:'o1', item_name:'Gloves', status:'pending', created_at:'2026-10-29T08:00:00Z'}];
  const sent = []; global.__fn = (name, b) => { if (name === 'send-report-email') { sent.push(b); return {ok:true}; } };
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/ppe'); await page.waitForTimeout(6000);
  await page.getByText(/PPE Requests/).first().click(); await page.waitForTimeout(500);
  console.log('export button before tick:', await page.getByText(/Export 1 \(PDF\)/).count());
  await page.getByText('☐').first().click(); await page.waitForTimeout(300);
  const dl = page.waitForEvent('download', {timeout:15000}).catch(()=>null);
  await page.getByText('Export 1 (PDF)').click();
  const d = await dl; console.log('download:', d ? d.suggestedFilename() : 'none');
  await page.waitForTimeout(500);
  await page.getByText('☐').first().click(); await page.waitForTimeout(300);
  await page.getByText('Email 1', {exact:true}).click(); await page.waitForTimeout(3000);
  console.log('emails sent:', sent.length, sent[0] && sent[0].attachments.map(a=>a.filename));
  await page.screenshot({path:'shots/ppereq.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
