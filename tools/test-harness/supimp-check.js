// Admin › Suppliers › + Add Supplier › Choose Excel / CSV file: imports name + email rows, skips clashes.
const {chromium, makeContext} = require('./harness');
const fs = require('fs'), path = require('path');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.suppliers = [{id:'s1', org_id:db.profiles[0].org_id, name:'SIG Roofing', email:'sig@sig.co'}];
  const csv = path.join(__dirname, 'shots', 'suppliers.csv');
  fs.writeFileSync(csv, 'Name,Email\nSIG roofing,a@sig.co\nJewson,j@jewson.co\nTravis Perkins,tp@tp.co\n');
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/pm/admin/suppliers'); await page.waitForTimeout(5000);
  await page.getByText('+ Add Supplier').click(); await page.waitForTimeout(400);
  const fc = page.waitForEvent('filechooser');
  await page.getByText('📊 Choose Excel / CSV file').click();
  await (await fc).setFiles(csv); await page.waitForTimeout(3000);
  console.log('suppliers now:', db.suppliers.map(s=>s.name).join(', '));
  await page.screenshot({path:'shots/supimp.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
