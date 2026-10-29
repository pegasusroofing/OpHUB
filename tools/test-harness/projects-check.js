// Projects (manager): tabs and search, + New project (folders + TBT bank), status menu → Close, PM picker.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); const org = db.profiles[0].org_id; db.profiles[0].howto_dismissed = ['*'];
  db.tbt_templates = [{id:'tt1', org_id:org, title:'Working at height', storage_path:'x/wah.pdf'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.accept());
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites'); await page.waitForTimeout(5000);
  const txt = async()=> (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  console.log('list:', (await txt()).slice(0, 260));
  await page.getByPlaceholder('🔍 Search projects').fill('studley'); await page.waitForTimeout(800);
  console.log('search:', (await txt()).match(/Live \(\d+\)|Upcoming \(\d+\)|No projects match\./g));
  await page.getByPlaceholder('🔍 Search projects').fill('');
  await page.getByText('+ New project', {exact:true}).click(); await page.waitForTimeout(3000);
  const f = page.locator('input:visible');
  await f.nth(0).fill('High Street Flats'); await f.nth(1).fill('1 High Street'); await f.nth(2).fill('ab1 2cd'); await f.nth(3).fill('J900');
  await page.getByText('Upcoming', {exact:true}).last().click();
  await page.locator('input[placeholder="YYYY-MM-DD"]:visible').fill('2026-12-01');
  await page.getByText('Create Project', {exact:true}).click(); await page.waitForTimeout(4000);
  const s = db.sites.find(x=>x.name==='High Street Flats');
  console.log('created:', JSON.stringify(s && [s.job_number, s.status, s.start_date, s.postcode]), '| folders', (db.drawing_folders||[]).filter(x=>s&&x.site_id===s.id).map(x=>x.name).join('/'), '| tbt bank', (db.toolbox_talks||[]).filter(x=>s&&x.site_id===s.id).length, '| url', page.url().replace(BASE,''));
  await page.goto(BASE+'/sites'); await page.waitForTimeout(4000);
  await page.getByLabel(/^Status /).first().click(); await page.waitForTimeout(500);
  await page.getByText('Close', {exact:true}).click(); await page.waitForTimeout(2000);
  console.log('closed:', db.sites.filter(x=>x.status==='closed').map(x=>x.name).join(', '));
  await page.getByLabel(/responsible PM/i).first().click(); await page.waitForTimeout(500);
  const opt = await page.evaluate(()=>[...document.querySelectorAll('div')].map(d=>d.innerText).filter(t=>/^Dave Price/.test(t||''))[0]);
  if(opt){ await page.getByText(opt, {exact:true}).first().click(); await page.waitForTimeout(2000); }
  console.log('pm set:', db.sites.filter(x=>x.responsible_pm_id).map(x=>x.name+'='+x.responsible_pm_id).join(', '), '|', errs.join(' / ') || 'no errors');
  await browser.close(); process.exit(0);
})();
