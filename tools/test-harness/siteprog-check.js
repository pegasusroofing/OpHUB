// Application page: "Use site progress" brings Ridge up to the site's 60%, and its % box shows it.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex12')(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/application/ap2'); await page.waitForTimeout(6000);
  await page.getByText('Line By Line', {exact:true}).click(); await page.waitForTimeout(1000); // the lines and site progress are on Line By Line
  const boxes = async ()=>JSON.stringify((await page.locator('input').evaluateAll(els=>els.map(e=>e.value))).slice(0, 2)); // Tiling, Ridge applied %
  console.log('before', await boxes());
  await page.getByText('Use site progress', {exact:true}).click(); await page.waitForTimeout(800);
  await page.locator('text="Use site progress" >> visible=true').last().click(); await page.waitForTimeout(1000); // it asks first; the yes button says Use site progress
  console.log('after', await boxes());
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
