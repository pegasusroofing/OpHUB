// Finance-only company: Projects pages go to Finance; Team page; project edit in Finance; someone without Finance is told.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const run = async (finance) => {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
    db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = finance;
    (db.organizations||[]).forEach(o=>{ o.has_pm = false; o.has_finance = true; });
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
    return {page, db, ctx};
  };
  let {page, db, ctx} = await run(true);
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(4000);
  console.log('PM page went to:', page.url().replace(BASE,''));
  await page.goto(BASE+'/fin/team'); await page.waitForTimeout(4000);
  await page.screenshot({path:'shots/finteam.png'});
  console.log('team shows people:', (await page.evaluate(()=>document.body.innerText)).includes('Finance on'));
  await page.goto(BASE+'/fin/job/'+S1); await page.waitForTimeout(4000);
  await page.getByText('Project Admin', {exact:true}).first().click(); await page.waitForTimeout(1200);
  await page.getByText(/Project — name, client/).click(); await page.waitForTimeout(800);
  await page.locator('input').first().fill('Studley Road Re-roof'); await page.getByText('Save', {exact:true}).last().click(); await page.waitForTimeout(2000);
  console.log('site name now:', db.sites.find(s=>s.id===S1).name);
  await ctx.close();
  ({page} = await run(false));
  await page.waitForTimeout(1500);
  console.log('no-finance user sees:', (await page.evaluate(()=>document.body.innerText)).includes('You don’t have OpHUB Finance yet'));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
