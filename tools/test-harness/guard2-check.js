// Typed links: a client on snagging/variations → snag list; an operative on a repair job's To Do List gets in
// (not on a normal job); Main Contractor pages need the job switched on; hidden MC tiles blocked for operatives.
const {chromium, makeContext, S1} = require('./harness');
const login = async (page) => { await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000); };
const at = (page) => page.url().replace('http://localhost:8081','');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  {
    const {ctx, db} = await makeContext(browser, 'client', [], {viewport:{width:1300, height:900}});
    db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/sites/'+S1+'/snagging/variations'); await page.waitForTimeout(5000);
    console.log('client variations →', at(page)); await ctx.close();
  }
  for (const repair of [false, true]) {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport:{width:390, height:800}});
    const st = db.sites.find(s=>s.id===S1); st.repair_contract = repair; st.acting_as_main_contractor = false;
    db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/sites/'+S1+'/todos'); await page.waitForTimeout(5000);
    console.log('operative todos (repair='+repair+') →', at(page), '| managers-only text', await page.getByText('Managers only.').count());
    if (!repair) { await page.goto('http://localhost:8081/sites/'+S1+'/mc/permits'); await page.waitForTimeout(5000); console.log('operative mc/permits (not MC job) →', at(page)); }
    await ctx.close();
  }
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport:{width:390, height:800}});
    const st = db.sites.find(s=>s.id===S1); st.acting_as_main_contractor = true; st.mc_hidden_tiles = ['permits'];
    db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); await login(page);
    await page.goto('http://localhost:8081/sites/'+S1+'/mc/permits'); await page.waitForTimeout(5000);
    console.log('operative hidden mc/permits →', at(page));
    await page.goto('http://localhost:8081/sites/'+S1+'/mc/inspections'); await page.waitForTimeout(5000);
    console.log('operative shown mc/inspections →', at(page)); await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
