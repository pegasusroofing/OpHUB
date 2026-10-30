// Old-app links: app.html#/join/<id> → the join page; /#/reset?t=..&e=.. → the reset page with its token;
// ?onedrive=success after signing in → Admin › OneDrive with "OneDrive connected".
const {chromium, makeContext} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/app.html#/join/abc123'); await page.waitForTimeout(6000);
  console.log('join →', page.url().replace('http://localhost:8081',''));
  await page.goto('http://localhost:8081/#/reset?t=TOK&e=a%40x.co'); await page.waitForTimeout(6000);
  console.log('reset →', page.url().replace('http://localhost:8081',''));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/app.html#/team?onedrive=success'); await page.waitForTimeout(2500);
  console.log('onedrive →', page.url().replace('http://localhost:8081',''), '| toast', await page.getByText('OneDrive connected').count());
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
