// HAVS (manager): Choose… → tick operatives → Export Selected. PUWER roster: tick → Export Selected.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.havs_tools = [{id:'ht1', org_id:org, name:'Breaker', vibration:10, active:true}];
  db.site_havs_tools = [{id:'sh1', site_id:S1, tool_id:'ht1'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/hs/havs'); await page.waitForTimeout(6000);
  const ch = page.getByText('Choose…', {exact:true});
  console.log('HAVS choose button:', await ch.count());
  if (await ch.count()) {
    await ch.click(); await page.waitForTimeout(400);
    await page.getByText('Jake Morris').last().click(); await page.waitForTimeout(300);
    const dl = page.waitForEvent('download', {timeout:15000}).catch(()=>null);
    await page.getByText(/Export Selected \(1\)/).click();
    const d = await dl; console.log('HAVS selected download:', d ? d.suggestedFilename() : 'none');
  } else await page.screenshot({path:'shots/havs-mgr.png'});
  await page.goto(BASE+'/sites/'+S1+'/hs/puwer'); await page.waitForTimeout(6000);
  await page.getByLabel('Tick Jake Morris').click(); await page.waitForTimeout(300);
  const dl2 = page.waitForEvent('download', {timeout:15000}).catch(()=>null);
  await page.getByText(/Export Selected \(1\)/).click();
  const d2 = await dl2; console.log('PUWER selected download:', d2 ? d2.suggestedFilename() : 'none');
  await page.screenshot({path:'shots/puwer-sel.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
