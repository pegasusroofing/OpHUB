// HAVS: after Save Minutes the box is empty again (no double entry). Operatives can't open HAVS / LOLER by link
// (site managers only unless the PM shows the tile to operatives).
const {chromium, makeContext, S1} = require('./harness');
const login = async (page) => { await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000); };
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
    db.profiles[0].howto_dismissed = ['*'];
    const org = db.profiles[0].org_id;
    db.havs_tools = [{id:'ht1', org_id:org, name:'Breaker', vibration:10, active:true}];
    db.site_havs_tools = [{id:'sh1', site_id:S1, tool_id:'ht1'}];
    db.havs_entries = [];
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await login(page);
    await page.goto('http://localhost:8081/sites/'+S1+'/hs/havs'); await page.waitForTimeout(6000);
    const box = page.locator('input[placeholder="Mins"] >> visible=true').first();
    if (!(await box.count())) { await page.getByText(/^Mon/).first().click(); await page.waitForTimeout(500); }
    await page.locator('input[placeholder="Mins"] >> visible=true').first().fill('30');
    await page.locator('text="Save Minutes" >> visible=true').first().click(); await page.waitForTimeout(3000);
    console.log('saved entries', db.havs_entries.length, '| box now', JSON.stringify(await page.locator('input[placeholder="Mins"] >> visible=true').first().inputValue()));
    await ctx.close();
  }
  {
    const {ctx} = await makeContext(browser, 'operative', [], {viewport:{width:390, height:800}});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await login(page);
    for (const p of ['havs', 'loler']) { await page.goto('http://localhost:8081/sites/'+S1+'/hs/'+p); await page.waitForTimeout(5000); console.log('operative /hs/'+p+' →', page.url().replace('http://localhost:8081','')); }
    await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
