// Check In page (manager): geofence radius chosen, set-location pop-up, small export buttons at the bottom.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(x=>x.id===S1); st.geofence_lat = null; st.geofence_lon = null; st.geofence_radius_m = '100';
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/checkin'); await page.waitForTimeout(5000);
  await page.screenshot({path:'shots/ck-1.png', fullPage:true});
  await page.getByText(/^Set .* location$/).first().click(); await page.waitForTimeout(600);
  await page.screenshot({path:'shots/ck-2-pop.png'});
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
