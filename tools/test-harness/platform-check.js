// Platform owner: the Platform Admin home lists companies; expanding one shows package, modules and people.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); const me = db.profiles.find(p=>p.id==='me'); me.role = 'superadmin'; me.view_as_org_id = null;
  db.subscriptions = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(6000);
  const t = async()=> (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  console.log('home:', (await t()).slice(0, 300));
  const name = (db.organizations[0]||{}).name; if(name){ await page.getByText(name, {exact:true}).last().click(); await page.waitForTimeout(1000); const s = await t(); const i = s.indexOf('Package'); console.log('expanded:', s.slice(i, i+260)); }
  await page.getByText('OpHUB Pro', {exact:true}).first().click(); await page.waitForTimeout(1500);
  console.log('plan now:', db.organizations[0].plan_tier, '|', errs.join(' / ') || 'no errors');
  // Systems per company (Andy, 14 Nov 2026): OpHUB Projects / OpHUB Finance / Projects + Finance.
  await page.getByText('OpHUB Finance', {exact:true}).filter({visible:true}).last().click(); await page.waitForTimeout(800);
  await page.getByText('Switch', {exact:true}).filter({visible:true}).last().click(); await page.waitForTimeout(1800);
  const o = db.organizations[0];
  console.log((o.has_pm === false && o.has_finance === true ? 'PASS' : 'FAIL') + ' systems: Finance only (has_pm ' + o.has_pm + ', has_finance ' + o.has_finance + ')');
  await page.getByText('Projects + Finance', {exact:true}).filter({visible:true}).last().click(); await page.waitForTimeout(1800);
  console.log((o.has_pm === true && o.has_finance === true ? 'PASS' : 'FAIL') + ' systems: both (has_pm ' + o.has_pm + ', has_finance ' + o.has_finance + ')');
  await page.screenshot({path: require('path').join(__dirname, 'shots', 'rams14', 'platform-systems.png')});
  await browser.close(); process.exit(0);
})();
