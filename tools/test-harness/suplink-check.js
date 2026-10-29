// Link a Projects supplier to its Finance Directory record, from both sides.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.suppliers = [{id:'s1', org_id:org, name:'Jewson', email:'j@x.test', branches:[]},{id:'s2', org_id:org, name:'Travis Perkins', email:'t@x.test', branches:[]}];
  db.fin_suppliers = [{id:'f1', org_id:org, name:'Jewson Ltd', supplier_id:null},{id:'f2', org_id:org, name:'Travis Perkins Trading', supplier_id:null}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/pm/admin/suppliers'); await page.waitForTimeout(4000);
  await page.getByText('Jewson', {exact:true}).click(); await page.waitForTimeout(800);
  await page.getByLabel('Finance Directory (accounts)').click(); await page.waitForTimeout(400); await page.getByText('Jewson Ltd', {exact:true}).last().click(); await page.waitForTimeout(1500);
  console.log('after projects side:', JSON.stringify(db.fin_suppliers.map(f=>[f.name, f.supplier_id])));
  await page.goto(BASE+'/fin/directory?kind=supplier'); await page.waitForTimeout(4000);
  await page.getByText('Travis Perkins Trading').first().click(); await page.waitForTimeout(1000);
  await page.getByText('Not linked ▾').first().click().catch(async()=>{ await page.getByText(/Not linked/).first().click(); }); await page.waitForTimeout(400);
  await page.getByText('Travis Perkins', {exact:true}).last().click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/suplink.png'});
  await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(2000);
  console.log('after directory side:', JSON.stringify(db.fin_suppliers.map(f=>[f.name, f.supplier_id])));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
