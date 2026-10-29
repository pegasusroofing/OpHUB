// Application page: download the Excel and PDF, read the Excel back.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  db.fin_sub_payments=[{id:'sp1',org_id:db.organizations[0].id,name:'Dave Slater',utr:'1234567890',period_start:'2026-10-13',period_end:'2026-10-19',lines:[{site_id:S1,amount:1000,days:5}],labour:1000,materials:0,gross:1000,cis_rate:20,cis_deduction:200,net_pay:800,status:'paid',paid_on:'2026-10-24'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/labour/sp1'); await page.waitForTimeout(6000);
  await page.screenshot({path:'shots/native_cis-1300.png'});
  for(const [label, out] of [['CIS payment statement','shots/cis-test.pdf']]){
    const dl = page.waitForEvent('download', {timeout:20000});
    await page.getByText(label, {exact:true}).click();
    const d = await dl; await d.saveAs(out); console.log('saved', out, d.suggestedFilename(), fs.statSync(out).size);
  }
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
