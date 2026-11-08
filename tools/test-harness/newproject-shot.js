// Screenshot of the real Projects › Add A Project page (laptop, fake database), as it is today.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const page = await ctx.newPage();
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/new'); await page.waitForTimeout(5000);
  await page.screenshot({path: 'shots/newproject-today.png', fullPage: true});
  await browser.close();
})();
