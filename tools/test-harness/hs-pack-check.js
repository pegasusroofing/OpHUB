// RAMS list: tick two, Email → the CC box shows; send; check what the server got.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const browser = await chromium.launch(); const errs = []; const sent = [];
  global.__fn = (n, b)=>{ if(n==='send-document-email') sent.push(b); return {ok:true}; };
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  db.sites.find(s=>s.id===S1).client_email = 'client@bellway.test';
  require('./seeds/ex8')(db); db.rams_docs.push({id:'rd2',org_id:db.organizations[0].id,site_id:S1,name:'Scaffold RAMS',status:'current',storage_path:'o/rams/x.pdf',uploaded_at:'2026-10-02T09:00:00Z',subcontractor_company_id:null}); db.rams_docs.find(d=>d.id==='rd1').storage_path='o/rams/y.pdf';
  const {PDFDocument} = require('pdf-lib'); const pd = await PDFDocument.create(); pd.addPage([300,300]); const pdfBytes = Buffer.from(await pd.save());
  // The fake storage hands back a picture for everything; the RAMS files need to be real PDFs here.
  await ctx.route(/storage\/v1\/object\/.*\.pdf/, r=>r.request().method()==='GET' ? r.fulfill({status:200, contentType:'application/pdf', body:pdfBytes}) : r.fallback());
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/rams'); await page.waitForTimeout(5000);
  await page.getByText('☐ Select all').click(); await page.waitForTimeout(500);
  await page.getByText('✉ Email', {exact:true}).click(); await page.waitForTimeout(800);
  await page.screenshot({path:'shots/native_email_cc-1300.png'});
  await page.fill('input[placeholder="name@company.co.uk"]', 'qs@main.test');
  await page.getByText(/^CC me a copy/).click(); await page.getByText(/^CC the client/).click();
  await page.getByText('Send', {exact:true}).click();
  const seen = new Set();
  for(let i=0;i<16;i++){ await page.waitForTimeout(500); const t = await page.evaluate(()=>document.body.innerText.match(/(Building[^\n]*|Could not[^\n]*|Nothing to export[^\n]*|Sending…|Emailed|skipped[^\n]*)/g)); (t||[]).forEach(x=>seen.add(x)); }
  console.log('messages', JSON.stringify([...seen]));
  console.log('sent', JSON.stringify(sent.map(b=>[b.recipient_email,b.cc_email,b.client_cc_email,b.doc_title])));
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
