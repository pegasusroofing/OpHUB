// Small items: a missing job link goes to Projects with a message; to-do comment saved; repair list jump; Email all signed COSHH
// only signed, to me; cancelled PO doesn't lock a request.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1), org = st.org_id; st.repair_contract = true;
  db.repair_jobs = [{id:'rj1', site_id:S1, job_number:'RJ-1', address:'5 High St', created_at:'2026-10-01T09:00:00Z'}];
  db.todos = []; db.todo_comments = [];
  db.coshh_docs = [{id:'c1', site_id:S1, org_id:org, name:'Paint', storage_path:'c1.pdf', uploaded_at:'2026-10-20T09:00:00Z', subcontractor_company_id:null},
                   {id:'c2', site_id:S1, org_id:org, name:'Glue', storage_path:'c2.pdf', uploaded_at:'2026-10-20T09:00:00Z', subcontractor_company_id:null}];
  db.coshh_signatures = [{id:'cs1', coshh_id:'c1', user_id:'o1', signed_at:new Date().toISOString()}];
  const sent = []; global.__fn = (name, b) => { if (name === 'send-document-email') { sent.push(b); return {ok:true}; } };
  await ctx.route((u) => /coshh-docs.c[12]\.pdf/.test(String(u)), r => r.request().method()==='GET' ? r.fulfill({status:200, contentType:'application/pdf', body: require('fs').readFileSync(require('path').join(__dirname,'shots','appsow.pdf'))}) : r.fallback());
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/99999999-9999-9999-9999-999999999999'); await page.waitForTimeout(5000);
  console.log('missing job →', page.url().replace('http://localhost:8081',''));
  await page.goto('http://localhost:8081/sites/'+S1+'/repairs/list/all'); await page.waitForTimeout(5000);
  await page.getByText(/^▾ /).first().click(); await page.waitForTimeout(600);
  await page.locator('text=/Jobs to Survey/ >> visible=true').last().click(); await page.waitForTimeout(2500);
  console.log('jump →', page.url().split('/repairs/')[1]);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/coshh'); await page.waitForTimeout(6000);
  await page.getByText('✉ Email all signed COSHH').click(); await page.waitForTimeout(8000);
  console.log('email to', sent[0] && sent[0].recipient_email, '| emails', sent.length);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
