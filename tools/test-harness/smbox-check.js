// A site manager's Inbox "To sign / do" shows the manager feed (RAMS not signed by operatives, open snags, to-dos),
// not "COSHH to sign" for themselves.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'site_manager', [], {viewport:{width:390, height:800}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
  db.coshh_docs = [{id:'c1', site_id:S1, org_id:org, name:'Paint', storage_path:'c.pdf', uploaded_at:'2026-10-20T09:00:00Z', subcontractor_company_id:null}];
  db.snags = [{id:'sn1', site_id:S1, status:'open', title:'Cracked tile', created_at:'2026-10-25T09:00:00Z'}];
  db.todos = [{id:'td1', site_id:S1, text:'Order skip', done:false, created_at:'2026-10-25T09:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/inbox?tab=todo'); await page.waitForTimeout(7000);
  console.log('COSHH to sign (me)', await page.getByText(/COSHH to sign/).count(), '| snag', await page.getByText(/Open snag/).count(), '| task', await page.getByText(/Order skip/).count());
  await page.screenshot({path:'shots/smbox.png'});
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
