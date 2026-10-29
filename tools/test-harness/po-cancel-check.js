// PO page: Remove a line (its request is cancelled), then Cancel PO (the rest cancelled), then Reopen (put back).
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id;
  db.materials = (db.materials||[]).concat([{id:'m1',site_id:S1,item:'Slates',status:'sent'},{id:'m2',site_id:S1,item:'Battens',status:'pending'},{id:'m3',site_id:S1,item:'Nails',status:'sent'}]);
  db.purchase_orders = (db.purchase_orders||[]).concat([{id:'pox',org_id:O,site_id:S1,number:'J101-PO-009',status:'open',value:300,vat:60,total:360,material_ids:['m1','m2','m3'],items:[{item:'Slates',amount:100,material_id:'m1'},{item:'Battens',amount:100,material_id:'m2'},{item:'Nails',amount:100,material_id:'m3'}]}]);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.accept());
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/po/pox'); await page.waitForTimeout(5000);
  const st = ()=>JSON.stringify(db.materials.filter(m=>['m1','m2','m3'].includes(m.id)).map(m=>m.status));
  await page.getByText('Remove lines…').click(); await page.waitForTimeout(500);
  await page.getByText('☐').nth(2).click(); await page.getByText('Remove ticked lines').click(); await page.waitForTimeout(800);
  await page.waitForTimeout(2500);
  const po = db.purchase_orders.find(p=>p.id==='pox'); console.log('after remove', st(), po.items.length, po.value, po.vat, po.total);
  await page.getByText('Cancel PO', {exact:true}).click(); await page.waitForTimeout(800);
  await page.waitForTimeout(2500); // the web confirm is accepted by the dialog handler
  console.log('after cancel', st(), po.status, JSON.stringify(po.items.map(i=>i.was_status)));
  await page.getByText('Reopen PO', {exact:true}).click(); await page.waitForTimeout(2500);
  console.log('after reopen', st(), po.status);
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
