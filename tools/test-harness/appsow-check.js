// Application PDF with the Schedule of Works report at the end (proof of works).
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}, acceptDownloads:true});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  db.schedule_tasks = [{id:'st1', site_id:S1, name:'Strip and re-felt', status:'done', position:1, created_at:'2026-10-01'},{id:'st2', site_id:S1, name:'Lead flashings', status:'progress', position:2, created_at:'2026-10-01'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/job/'+S1+'/application/ap2'); await page.waitForTimeout(6000);
  await page.getByText('⬇ Download PDF', {exact:true}).click(); await page.waitForTimeout(1200);
  await page.screenshot({path:'shots/appsow-ask.png'});
  const dl = page.waitForEvent('download', {timeout:30000});
  await page.getByText('📋 Yes — the whole Schedule of Works').click();
  const d = await dl; await d.saveAs('shots/appsow.pdf');
  const pdf = await PDFDocument.load(fs.readFileSync('shots/appsow.pdf'));
  console.log('pdf', d.suggestedFilename(), 'pages', pdf.getPageCount());
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
