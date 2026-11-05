// Application page: download the Excel and PDF, read the Excel back.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/job/'+S1+'/application/ap2'); await page.waitForTimeout(6000);
  await page.screenshot({path:'shots/native_app_export-1300.png'});
  // Export Excel (by Save) downloads straight away. The footer's Export To PDF asks how: 📄 PDF downloads it, ☁️ OneDrive saves it
  // to the job's OneDrive folder (this replaced the old "☁️ Save to OneDrive" bar after a download).
  { const dl = page.waitForEvent('download', {timeout:20000}); await page.getByText('Export Excel', {exact:true}).first().click();
    const d = await dl; await d.saveAs('shots/app-test.xlsx'); console.log('saved', 'shots/app-test.xlsx', d.suggestedFilename()); }
  { const dl = page.waitForEvent('download', {timeout:20000}); await page.getByText('Export To PDF', {exact:true}).click(); await page.waitForTimeout(1200);
    console.log('choices shown', await page.getByText('📄 PDF', {exact:true}).count(), await page.getByText('☁️ OneDrive', {exact:true}).count());
    await page.getByText('📄 PDF', {exact:true}).click(); const d = await dl; await d.saveAs('shots/app-test.pdf'); console.log('saved', 'shots/app-test.pdf', d.suggestedFilename()); }
  global.__fn=(n,b)=>{ if(n==='onedrive-upload') console.log('upload', b.filename, b.site_id||b.subfolder); return {ok:true}; };
  await page.getByText('Export To PDF', {exact:true}).click(); await page.waitForTimeout(1200);
  const od = await page.getByText('☁️ OneDrive', {exact:true}).count(); console.log('bar shown', od);
  if (od) { await page.getByText('☁️ OneDrive', {exact:true}).click(); await page.waitForTimeout(2500); }
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
