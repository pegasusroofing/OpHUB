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
  for(const [label, out] of [['⬇ Download Excel','shots/app-test.xlsx'],['⬇ Download PDF','shots/app-test.pdf']]){
    const dl = page.waitForEvent('download', {timeout:20000});
    await page.getByText(label, {exact:true}).click();
    const d = await dl; await d.saveAs(out); console.log('saved', out, d.suggestedFilename()); if(out.endsWith('.pdf')){ await page.waitForTimeout(800); const bar = await page.getByText('☁️ Save to OneDrive').count(); console.log('bar shown', bar); global.__fn=(n,b)=>{ if(n==='onedrive-upload') console.log('upload', b.filename, b.site_id||b.subfolder); return {ok:true}; }; await page.getByText('☁️ Save to OneDrive').click(); await page.waitForTimeout(2500); }
  }
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
