// Client on Site Rules & Layout: sees signed / outstanding and Export Signed PDF, no "Tap to sign".
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'client', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); st.acting_as_main_contractor = true;
  db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
  db.rams_docs = [{id:'r1', site_id:S1, org_id:st.org_id, name:'Working at Height', storage_path:'a.pdf', status:'current', uploaded_by:'o1', uploaded_at:'2026-10-20T09:00:00Z', doc_type:'RAMS', subcontractor_company_id:null}];
  db.site_layout_docs = [{id:'l1', site_id:S1, org_id:st.org_id, name:'Site rules', storage_path:'l.pdf', status:'current', uploaded_by:'o1', uploaded_at:'2026-10-20T09:00:00Z'}];
  db.rams_signatures = [{id:'rsg', rams_id:'r1', user_id:'o1', signed_at:'2026-10-21T09:00:00Z'}];
  db.site_layout_signatures = [{id:'ls1', layout_id:'l1', site_layout_id:'l1', doc_id:'l1', user_id:'o1', signed_at:'2026-10-21T09:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/mc/layout'); await page.waitForTimeout(6000);
  console.log('tap to sign:', await page.getByText(/Tap to sign/).count(), '| sign all:', await page.getByText(/Sign All/).count(), '| export:', await page.getByText(/Export Signed PDF/).count());
  await page.goto(BASE+'/sites/'+S1+'/hs/rams'); await page.waitForTimeout(5000);
  console.log('RAMS as client — tap to sign:', await page.getByText(/Tap to sign/).count(), '| sign all:', await page.getByText(/Sign All/).count(), '| export:', await page.getByText(/Export Signed PDF/).count(), '| export:', await page.getByText(/Export Signed PDF/).count(), '| doc shown:', await page.getByText('Working at Height').count());
  await page.screenshot({path:'shots/clientlayout.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
