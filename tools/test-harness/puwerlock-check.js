// PUWER: a client sees the week's roster (Done / Pending, Export) with nothing to fill in; a manager opening a
// saved inspection finds it locked (no Save).
const {chromium, makeContext, S1} = require('./harness');
const login = async (page) => { await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000); };
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  {
    const {ctx, db} = await makeContext(browser, 'client', [], {viewport:{width:1300, height:900}});
    db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/sites/'+S1+'/hs/puwer'); await page.waitForTimeout(6000);
    console.log('client: Jake listed', await page.getByText('Jake Morris').count(), '| mark complete', await page.getByText('Mark This Week As Complete').count(), '| Export All', await page.getByText('Export All').count(), '| Email All', await page.getByText('Email All').count(), '| save', await page.getByText('Save Inspection').count());
    await ctx.close();
  }
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
    db.profiles[0].howto_dismissed = ['*'];
    const d = new Date(); const day = (d.getDay()+6)%7; d.setDate(d.getDate()-day); const ws = d.toISOString().slice(0,10);
    db.operative_tools = [{id:'t1', user_id:'o1', org_id:db.profiles[0].org_id, name:'Drill', active:true}];
    db.puwer_inspections = [{id:'pi1', site_id:S1, user_id:'o1', week_start:ws, comments:'ok', created_at:new Date().toISOString()}];
    db.puwer_inspection_items = [{id:'pii1', inspection_id:'pi1', tool_id:'t1', q1:true, q2:true, q3:true, q4:true, q5:true}];
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/sites/'+S1+'/hs/puwer?user=o1'); await page.waitForTimeout(6000);
    console.log('manager on saved: save button', await page.getByText('Save Inspection').count());
    await page.screenshot({path:'shots/puwerlock.png'});
    await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
