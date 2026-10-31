// Company admin: a client signed up off the wrong link can be set to any role. Fake database.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:390, height:844}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.profiles.push({id:'cl9', org_id:org, name:'Wrong Link', email:'w@x.co', role:'client', finance_enabled:true, see_costs:true});
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/pm/admin/users'); await page.waitForTimeout(6000);
  await page.getByText('Wrong Link').first().click({timeout:8000}); await page.waitForTimeout(1500);
  await page.getByText(/^Role: Client/).first().click({timeout:5000}); await page.waitForTimeout(1500);
  await page.screenshot({path:'shots/rolechange.png'});
  const body = await page.locator('body').innerText();
  console.log('offered', ['Company Admin','Project Manager','Estimator','Site Manager','Operative','Delivery Driver'].filter(x=>body.includes(x)).join(', '));
  await page.getByText('Site Manager', {exact:true}).last().click({timeout:5000}); await page.waitForTimeout(1200);
  await page.getByText('Change', {exact:true}).last().click({timeout:5000}); await page.waitForTimeout(2500);
  const p = db.profiles.find(x=>x.id==='cl9');
  console.log('saved', p.role, 'finance', p.finance_enabled, 'costs', p.see_costs);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})().catch((e)=>{ console.log('STOPPED', e.message.slice(0,300)); process.exit(1); });
