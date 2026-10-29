// Materials › Import from Excel (CSV here): lines become requests in the file's order.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs'), path = require('path');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].howto_dismissed = ['*']; db.materials = [];
  const csv = path.join(__dirname, 'shots', 'order.csv'); fs.writeFileSync(csv, 'Order for Studley\n\nItem,Qty,Unit\nBatten 25x50,100,m\nFelt,4,roll\nTotal,104,\n');
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.type()==='prompt' ? d.accept('') : d.accept());
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/materials/requests'); await page.waitForTimeout(5000);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📄 Import from Excel', {exact:true}).click()]);
  await fc.setFiles(csv); await page.waitForTimeout(4000);
  console.log('materials:', JSON.stringify(db.materials.map(m=>[m.item, m.qty, m.status])), '|', errs.join(' / ') || 'no errors');
  fs.unlinkSync(csv);
  await browser.close(); process.exit(0);
})();
