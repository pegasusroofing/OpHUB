// Site Inductions › Completed: linked OneDrive folder shown, Unlink clears it.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); st.acting_as_main_contractor = true; st.site_inductions_folder_id = 'f1'; st.site_inductions_folder_name = 'Studley Inductions';
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/mc/inductions'); await page.waitForTimeout(5000);
  await page.getByText('Completed Inductions').click(); await page.waitForTimeout(500);
  console.log('folder shown:', await page.getByText(/Studley Inductions/).count());
  await page.getByText(/Signed inductions are pushed to/).click(); await page.waitForTimeout(400);
  await page.getByText('🗑 Unlink').click(); await page.waitForTimeout(400);
  await page.getByText('Unlink', {exact:true}).last().click(); await page.waitForTimeout(2000);
  console.log('unlinked:', st.site_inductions_folder_id === null, '| link button back:', await page.getByText(/Link OneDrive inductions folder/).count());
  await page.screenshot({path:'shots/indod.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
