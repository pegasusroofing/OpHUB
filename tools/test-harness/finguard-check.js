// 1) Someone without Finance typing a Finance detail address is sent home. 2) A Finance-only company's
// first admin with no logo lands on Set Up Your Company (no redirect loop).
const {chromium, makeContext, S1} = require('./harness');
const login = async (page) => { await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(6000); };
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  {
    const {ctx, db} = await makeContext(browser, 'pm', [], {viewport:{width:1300, height:900}});
    db.profiles[0].finance_enabled = false; db.profiles[0].howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await login(page);
    await page.goto('http://localhost:8081/fin/job/'+S1+'/invoice/new'); await page.waitForTimeout(5000);
    console.log('no-finance PM → ', page.url().replace('http://localhost:8081',''));
    await ctx.close();
  }
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
    const o = db.organizations[0]; o.logo_path = null; o.has_pm = false; o.has_finance = true;
    db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    const urls = []; page.on('framenavigated', f => { if (f === page.mainFrame()) urls.push(f.url().replace('http://localhost:8081','')); });
    await login(page); await page.waitForTimeout(3000);
    console.log('finance-only no logo → ', page.url().replace('http://localhost:8081',''), '| navigations', urls.length);
    await page.screenshot({path:'shots/finonly-setup.png'});
    await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
