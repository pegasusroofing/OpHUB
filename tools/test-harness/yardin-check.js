// Book Stock Into The Yard: Finance "Book stock in" opens the full form; pick a PO (fills supplier + ref) → yard_moves row has po_id.
// Materials (manager) has a "⬇ Book into yard" tab.
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.yard_stock = [{id:'y1', org_id:org, item:'Slates', unit:'pcs', qty:100, active:true}];
  db.yard_moves = [];
  db.purchase_orders = [{id:'po1', org_id:org, number:'J101-PO-004', supplier_name:'SIG', status:'open', created_at:'2026-10-29T08:00:00Z'},
                        {id:'po2', org_id:org, number:'J101-PO-001', supplier_name:'Old', status:'cancelled', created_at:'2026-10-20T08:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/yard'); await page.waitForTimeout(5000);
  // The row's ⬇ Book In asks New Delivery / Returned From A Job; a new delivery opens the full form with the item chosen (14 Nov).
  await page.getByText('⬇ Book In', {exact:true}).first().click(); await page.waitForTimeout(800);
  await page.locator('text="New Delivery" >> visible=true').last().click(); await page.waitForTimeout(4000);
  check(page.url().includes('/fin/yardin'), `Book In › New Delivery opens the full form (${page.url().replace(BASE,'')})`);
  check(await page.locator('text=/^▼ Slates/ >> visible=true').count() > 0, 'the row\'s item is already chosen');
  await page.locator('input[placeholder="Qty, e.g. 40"] >> visible=true').fill('40');
  await page.locator('text=▼ None >> visible=true').click(); await page.waitForTimeout(300);
  check(await page.getByText('J101-PO-001').count() === 0, 'a cancelled PO is not offered');
  await page.locator('text=J101-PO-004 >> visible=true').first().click(); await page.waitForTimeout(300);
  const sup = await page.locator('input[placeholder="From (supplier)"] >> visible=true').inputValue(), ref = await page.locator('input[placeholder="PO or delivery note number"] >> visible=true').inputValue();
  check(sup === 'SIG' && ref === 'J101-PO-004', `picking the PO fills the supplier and reference (${sup} / ${ref})`);
  await page.screenshot({path:'shots/yardin.png'});
  await page.locator('text="Book In" >> visible=true').click(); await page.waitForTimeout(2500);
  const mv = db.yard_moves.slice(-1)[0] || {};
  check(mv.kind === 'in' && Number(mv.qty) === 40 && mv.po_id === 'po1' && mv.supplier_name === 'SIG', `the booking saves with its PO (${JSON.stringify({k: mv.kind, q: mv.qty, po: mv.po_id, sup: mv.supplier_name})})`);
  await page.goto(BASE+'/sites/'+S1+'/materials/requests'); await page.waitForTimeout(5000);
  const t = page.getByText('Book Into Yard', {exact: true});
  check(await t.count() > 0, 'a job\'s Materials has a Book Into Yard tab');
  if (await t.count()) { await t.first().click(); await page.waitForTimeout(3000); check(/materials\/bookin/.test(page.url()), `the tab opens the job's Book Into Yard (${page.url().replace(BASE,'')})`); }
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0,400)}`);
  await browser.close();
})();
