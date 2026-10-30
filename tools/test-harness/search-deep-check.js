// Search finds material requests, snags, to-dos and Admin Centre items.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; const org = db.profiles[0].org_id;
  db.materials = [{id:'m1', site_id:S1, item:'Ridge tiles red', qty:'40', status:'pending', created_at:new Date().toISOString()}];
  db.snags = [{id:'n1', site_id:S1, title:'Ridge tile cracked', location:'Rear', status:'open', created_at:new Date().toISOString()}];
  db.todos = [{id:'t1', org_id:org, site_id:S1, text:'Order ridge vents', done:false, created_at:new Date().toISOString()}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/search'); await page.waitForTimeout(3000);
  await page.locator('input').first().fill('ridge'); await page.waitForTimeout(3000);
  const t = await page.evaluate(()=>document.body.innerText);
  console.log('found:', ['Ridge tiles red','Ridge tile cracked','Order ridge vents'].map(x=>x+':'+t.includes(x)).join(' '));
  await page.locator('input').first().fill('suppliers'); await page.waitForTimeout(1500);
  console.log('admin item:', (await page.evaluate(()=>document.body.innerText)).includes('ADMIN CENTRE') || (await page.evaluate(()=>document.body.innerText)).includes('Admin Centre'));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
