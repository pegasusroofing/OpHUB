// Small items: ★ on Admin › Suppliers; Upcoming card start date; dashboard card opens Projects on that group; Inbox tab count.
const {chromium, makeContext, S1} = require('./harness');
const login = async (page) => { await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000); };
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
    db.profiles[0].howto_dismissed = ['*'];
    const org = db.profiles[0].org_id; const st = db.sites.find(s=>s.id===S1);
    db.suppliers = [{id:'s1', org_id:org, name:'SIG', email:'s@x.co', favourite:false}];
    db.sites.push({...st, id:'22222222-2222-2222-2222-222222222229', name:'Future Job', status:'upcoming', start_date:'2027-01-10', job_number:'J999'});
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await login(page);
    await page.goto('http://localhost:8081/pm/admin/suppliers'); await page.waitForTimeout(5000);
    await page.getByLabel('Favourite SIG').click(); await page.waitForTimeout(2000);
    console.log('favourite', db.suppliers[0].favourite);
    await page.goto('http://localhost:8081/sites?tab=upcoming'); await page.waitForTimeout(5000);
    console.log('upcoming tab shows Future Job', await page.getByText('Future Job').count(), '| Studley hidden', (await page.getByText('Studley Rd').count()) === 0);
    await page.getByText(/^Starts /).first().click(); await page.waitForTimeout(1000);
    await page.screenshot({path:'shots/startdate.png'});
    console.log('calendar opened', await page.getByText(/Start date for Future Job/).count());
    await ctx.close();
  }
  {
    const {ctx, db} = await makeContext(browser, 'site_manager', [], {viewport:{width:390, height:800}});
    db.profiles[0].howto_dismissed = ['*'];
    db.site_assignments.push({id:'sa9', site_id:S1, user_id:'me'});
    db.snags = [{id:'sn1', site_id:S1, status:'open', title:'Cracked tile', created_at:'2026-10-25T09:00:00Z'}];
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await login(page); await page.waitForTimeout(3000);
    await page.screenshot({path:'shots/smtabs.png'});
    console.log('tab text', (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(-70));
    await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
