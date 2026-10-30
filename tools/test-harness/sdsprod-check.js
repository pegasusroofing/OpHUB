// COSHH Library › Products: "Add products from data sheets" — a new sheet makes a product flagged Check; the same
// sheet again doesn't make a duplicate and keeps what was worked on by hand.
const {chromium, makeContext} = require('./harness');
const {PDFDocument, StandardFonts} = require('pdf-lib'); const fs = require('fs');
(async()=>{
  const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica); const pg = doc.addPage();
  pg.drawText('SAFETY DATA SHEET', {x:30, y:760, size:12, font:f}); fs.writeFileSync('shots/Lead Sealant.pdf', await doc.save());
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.rams_library_items = []; db.coshh_library_files = []; db.coshh_library_folders = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  const add = async () => {
    await page.goto('http://localhost:8081/pm/admin/coshh'); await page.waitForTimeout(5000);
    const tab = page.getByText(/^Products/).first(); if (await tab.count()) { await tab.click(); await page.waitForTimeout(800); }
    const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText('📥 Add products from data sheets (PDF)').click()]);
    await fc.setFiles('shots/Lead Sealant.pdf'); await page.waitForTimeout(5000);
  };
  await add();
  console.log('first:', JSON.stringify(db.rams_library_items.map(i=>({t:i.title, check:i.data.needsCheck, sds:!!i.data.sdsPath}))), '| url', page.url().replace('http://localhost:8081','').slice(0,30));
  db.rams_library_items[0].data.use = 'Typed by hand';
  await add();
  console.log('second: products', db.rams_library_items.length, '| kept', db.rams_library_items[0].data.use);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
