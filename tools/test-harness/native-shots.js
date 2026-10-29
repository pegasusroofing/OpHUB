// Screenshots of the NEW app (app-native, web build on the Expo dev server)
// against the same fake Supabase as the other tests — no real data.
//   BASE=http://localhost:8081 ROLE=admin ROUTES=/pm,/pm/admin W=1300 node native-shots.js
const {chromium, makeContext, ORG, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = process.env.BASE || 'http://localhost:8081';
  const W = +process.env.W || 1300, H = +process.env.H || 900;
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, process.env.ROLE || 'admin', [], {viewport:{width:W, height:H}, ...(W<500?{isMobile:true, hasTouch:true, deviceScaleFactor:2}:{})});
  seed(db);
  db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  db.organizations[0].has_pm = true;
  if(process.env.EXTRA) require(process.env.EXTRA)(db);
  // supabase-js asks for one row (maybeSingle / single) with this Accept header.
  await ctx.route(/supabase\.co\/rest\/v1\/(?!rpc)/, async route=>{
    const req = route.request();
    if(!/vnd\.pgrst\.object/.test(req.headers()['accept']||'')) return route.fallback();
    const res = await route.fetch().catch(()=>null);
    let rows = []; try{ rows = res ? await res.json() : []; }catch(e){}
    if(!Array.isArray(rows)) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(rows)});
    if(!rows.length) return route.fulfill({status:406, contentType:'application/json', body:JSON.stringify({code:'PGRST116', message:'no rows'})});
    return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(rows[0])});
  });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co');
  await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  for(const r of (process.env.ROUTES||'/pm').split(',')){
    const path = r.replace(/SID0/g, S1);
    await page.goto(BASE+path); await page.waitForTimeout(+process.env.WAIT||5000);
    const f = 'shots/native'+r.replace(/[\/\[\]]/g,'_')+'-'+W+'.png';
    await page.screenshot({path:f, fullPage:false}); console.log('shot', f, page.url());
  }
  console.log('errors', errs.join(' | ')||'none'); await browser.close(); process.exit(0);
})();
