// Job Settings & Admin › Main Contractor › Company Library opens the subcontractor library.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.subcontractor_company_profiles = [{id:'cp1', org_id:db.profiles[0].org_id, name:'Brothers Scaffold'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/admin'); await page.waitForTimeout(5000);
  await page.getByText(/Site set up/).click(); await page.waitForTimeout(500);
  await page.getByText(/^Main Contractor$/).first().click(); await page.waitForTimeout(500);
  await page.getByText('📚 Company Library').click(); await page.waitForTimeout(4000);
  console.log('url:', page.url().replace(BASE,''), '| company listed:', await page.getByText('Brothers Scaffold').count());
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
