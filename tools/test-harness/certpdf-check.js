// Submitted application: "Fill in from the client's PDF" reads the last % on the row matching each line into Certified %.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const {PDFDocument, StandardFonts} = require('pdf-lib'); const fs = require('fs');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  const ap = db.fin_applications.find((a) => a.site_id === S1); ap.status = 'submitted'; ap.cert_net = null; ap.lines = [{kind:'section', description:'Main Roof'}, {kind:'item', item_id:'it1', description:'Strip and re-slate main roof', qty:1, rate:5000, value:5000, pct:10}];
  const item = (ap.lines || []).find((l) => l.description && l.kind !== 'section' && l.kind !== 'subsection');
  console.log('line', item && item.description);
  const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica); const pg = doc.addPage();
  pg.drawText(`${item.description}   Applied 10%   Certified 35%`, {x:30, y:700, size:10, font:f});
  fs.writeFileSync('shots/cert-client.pdf', await doc.save());
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/application/'+ap.id); await page.waitForTimeout(6000);
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText(/Fill in from the client.s PDF/).click()]);
  await fc.setFiles('shots/cert-client.pdf'); await page.waitForTimeout(6000);
  const vals = await page.locator('input >> visible=true').evaluateAll((els) => els.map((e) => e.value));
  console.log('35 filled in', vals.includes('35'));
  console.log('text', (await page.evaluate(() => document.body.innerText)).match(/Read \d+ line[^\n]*|Couldn.t read[^\n]*/)?.[0] || 'no message');
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
