// Toolbox talk: once signed, the manager ⋮ menu has no Rename / Replace file; a completed signed talk can't be deleted.
// Client: no sign box, "N signed" and Export Signed TBT.
const {chromium, makeContext, S1} = require('./harness');
const run = async (browser, role, status) => {
  const errs = [];
  const {ctx, db} = await makeContext(browser, role, [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1);
  if (role === 'client') db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
  db.toolbox_talks = [{id:'t1', site_id:S1, org_id:st.org_id, title:'Ladders', storage_path:'t.pdf', status, created_by:'me', created_at:'2026-10-20T09:00:00Z', subcontractor_company_id:null}];
  db.toolbox_talk_signatures = [{id:'ts1', tbt_id:'t1', user_id:'o1', signed_at:'2026-10-21T09:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/tbt/t1'); await page.waitForTimeout(6000);
  if (role === 'client') {
    console.log('client: tap to sign', await page.getByText(/Tap to sign/).count(), '| signed line', await page.getByText('1 signed').count(), '| export', await page.getByText('📄 Export Signed TBT').count());
  } else {
    await page.locator('text="⋮" >> visible=true').first().click(); await page.waitForTimeout(500);
    console.log(status+': rename', await page.getByText('✏️ Rename').count(), '| replace', await page.getByText('🔁 Replace file').count(), '| delete', await page.getByText('🗑 Delete').count());
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await ctx.close();
};
(async()=>{
  const browser = await chromium.launch();
  await run(browser, 'admin', 'live'); await run(browser, 'admin', 'completed'); await run(browser, 'client', 'live');
  await browser.close(); process.exit(0);
})();
