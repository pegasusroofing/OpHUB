// Price tile: Close several… → tick two prices → Close selected.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); st.price_enabled = true;
  db.pricing_elements = [{id:'e1', site_id:S1, name:'Main roof', price_total:5000, sort_order:0, closed:false},{id:'e2', site_id:S1, name:'Garage', price_total:800, sort_order:1, closed:false},{id:'e3', site_id:S1, name:'Porch', price_total:300, sort_order:2, closed:false}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/price'); await page.waitForTimeout(5000);
  await page.getByText('☑ Close several…').click(); await page.waitForTimeout(400);
  await page.getByText(/Garage/).first().click(); await page.getByText(/Porch/).first().click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/priceclose.png'});
  await page.getByText(/^Close 2 selected$/).click(); await page.waitForTimeout(800);
  await page.getByText('Close', {exact:true}).last().click(); await page.waitForTimeout(2000);
  console.log('closed:', db.pricing_elements.map(e=>e.name+':'+!!e.closed).join(' '));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
