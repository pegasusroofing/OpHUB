// Finance › New project for a Finance-only company: fill the form, create, and check the rows saved.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); (db.organizations||[]).forEach(o=>{ o.has_pm = false; o.has_finance = true; });
  db.fin_clients = [{id:'c1', org_id:db.profiles[0].org_id, name:'Acme Homes', email:'a@acme.test', address:'1 Road', postcode:'AB1 2CD', sales_vat:'rc20'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/newjob'); await page.waitForTimeout(6000);
  const inputs = page.locator('input, textarea');
  await inputs.nth(0).fill('Test Job'); await inputs.nth(1).fill('T100');
  await page.getByText('Application for payment', {exact:true}).click();
  await inputs.nth(2).fill('12,500'); await inputs.nth(3).fill('PO-77');
  await page.getByPlaceholder('From the Directory — a new name is added').fill('Acme Homes');
  await page.getByText('Create project', {exact:true}).last().click(); await page.waitForTimeout(5000);
  const s = (db.sites||[]).find(x=>x.name==='Test Job');
  console.log('url', page.url().replace(BASE,''), '| errors', errs.join(' / ').slice(0,300) || 'none');
  console.log('site', JSON.stringify(s && {job_number:s.job_number, client:s.client_name, email:s.client_email, multi:s.multi_site}));
  console.log('jf', JSON.stringify((db.job_finance||[]).find(x=>s && x.site_id===s.id)));
  console.log('po', JSON.stringify((db.client_pos||[]).find(x=>s && x.site_id===s.id)));
  await browser.close(); process.exit(0);
})();
