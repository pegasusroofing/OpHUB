// Draft application: "+ Add daywork" → type a description and value → autosave keeps it on the application.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  const ap = db.fin_applications.find((a) => a.status === 'draft' && a.site_id === S1) || db.fin_applications.find((a) => a.site_id === S1);
  ap.status = 'draft';
  await page.goto('http://localhost:8081/fin/job/'+S1+'/application/'+ap.id); await page.waitForTimeout(6000);
  await page.getByText('+ Add daywork').click(); await page.waitForTimeout(400);
  const descs = page.locator('input[placeholder="Description"] >> visible=true');
  await descs.last().fill('Extra scaffold lift'); await page.locator('input[placeholder="£ value"] >> visible=true').last().fill('350');
  await page.waitForTimeout(4500);
  const saved = db.fin_applications.find((a) => a.id === ap.id);
  console.log('dayworks saved', JSON.stringify((saved.dayworks || []).map((d) => [d.description, d.value])));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
