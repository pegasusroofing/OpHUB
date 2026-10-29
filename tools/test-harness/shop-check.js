// Project quotes: upload an Excel quote (Description / Unit / Rate), add it, rates saved.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed'); const ExcelJS = require('exceljs');
(async()=>{
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Quote');
  ws.addRow(['Description','Qty','Unit','Rate']); ws.addRow(['Marley Modern tile', 500, 'nr', 1.25]); ws.addRow(['Ridge tile', 40, 'nr', 6.5]); ws.addRow(['Total','','',1000]);
  await wb.xlsx.writeFile('shots/quote-test.xlsx');
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/quotes'); await page.waitForTimeout(5000);
  const fc = page.waitForEvent('filechooser'); await page.getByText('📥 Choose the quote file').click(); await (await fc).setFiles('shots/quote-test.xlsx'); await page.waitForTimeout(3000);
  await page.fill('input[placeholder="Supplier name"]', 'SIG Roofing');
  await page.getByText(/^Add \d+ items as a project quote/).click(); await page.waitForTimeout(3000);
  console.log('items', JSON.stringify((db.fin_shop_items||[]).map(i=>[i.description,i.unit,i.quote_label])), 'prices', JSON.stringify((db.fin_shop_prices||[]).map(p=>p.rate)));
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
