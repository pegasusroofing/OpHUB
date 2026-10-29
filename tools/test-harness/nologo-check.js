// A new company's admin (no logo yet) is kept on Set Up Your Company until a logo is added.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.organizations[0].logo_path = null; db.profiles[0].howto_dismissed = ['*'];
  console.log('me role', (db.profiles.find(p=>p.id==='me')||{}).role);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(7000);
  await page.screenshot({path:'shots/nologo.png'});
  console.log('url', page.url().replace(BASE,''), '|', (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,200), '|', errs.join(' / ') || 'no errors');
  await browser.close(); process.exit(0);
})();
