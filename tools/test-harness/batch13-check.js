// Last small items: site manager on Suppliers; assign operatives from the job home; driver diary opens the delivery;
// induction row Export; refused supplier rename snaps back; New COSHH "Product not listed".
const {chromium, makeContext, S1} = require('./harness');
const login = async (page) => { await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000); };
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  {
    const {ctx, db} = await makeContext(browser, 'site_manager', [], {viewport:{width:1300, height:900}});
    db.profiles[0].howto_dismissed = ['*'];
    db.suppliers = [{id:'s1', org_id:db.profiles[0].org_id, name:'SIG', email:'s@x.co'}, {id:'s2', org_id:db.profiles[0].org_id, name:'Jewson', email:'j@x.co'}];
    db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/pm/admin/suppliers'); await page.waitForTimeout(5000);
    console.log('SM sees suppliers', await page.getByText('Jewson').count(), '| managers-only', await page.getByText('Managers only.').count());
    await page.getByText('SIG', {exact:true}).first().click(); await page.waitForTimeout(600);
    const box = page.locator('text="Name"').locator('xpath=following::input[1]');
    await box.fill('Jewson'); await box.blur(); await page.waitForTimeout(1500);
    console.log('refused rename shows', await box.inputValue(), '| saved', db.suppliers[0].name);
    await ctx.close();
  }
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
    db.profiles[0].howto_dismissed = ['*'];
    db.site_assignments = [];
    db.delivery_tasks = [{id:'dt1', org_id:db.profiles[0].org_id, site_id:S1, description:'Slates', scheduled_date:new Date().toISOString().slice(0,10), time_slot:'7am', status:'pending', created_at:new Date().toISOString()}];
    db.rams_library_items = [];
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/sites/'+S1); await page.waitForTimeout(6000);
    await page.getByText(/Nobody is assigned/).click(); await page.waitForTimeout(1500);
    await page.getByText('Jake Morris').first().locator('xpath=ancestor::div[2]').getByText(/Assign/).first().click(); await page.waitForTimeout(2000);
    console.log('assigned', JSON.stringify(db.site_assignments.map(a=>a.user_id)));
    await page.goto('http://localhost:8081/pm/calendar'); await page.waitForTimeout(5000);
    await page.getByText('🚚 Driver diary').click(); await page.waitForTimeout(3000);
    await page.getByText(/Slates/).first().click(); await page.waitForTimeout(1200); await page.getByText(/Slates/).last().click(); await page.waitForTimeout(3000);
    console.log('diary tap →', page.url().replace('http://localhost:8081',''));
    await page.goto('http://localhost:8081/sites/'+S1+'/hs/coshh/new'); await page.waitForTimeout(5000);
    await page.getByText(/Product not listed/).click(); await page.waitForTimeout(800);
    await page.locator('input >> visible=true').last().fill('Bitumen Primer'); await page.locator('text="OK" >> visible=true').last().click(); await page.waitForTimeout(3000);
    console.log('product', db.rams_library_items.map(i=>i.title).join(','), '| url', page.url().includes('/pm/admin/coshh/'));
    await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
