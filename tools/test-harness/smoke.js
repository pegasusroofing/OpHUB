const {chromium, makeContext, serve, login, S1, S2, S3} = require('./harness'); const seed=require('./fresh/seed');
(async()=>{
  const {srv,port}=await serve(); const browser=await chromium.launch();
  const role = process.env.ROLE||'admin';
  const {ctx,db}=await makeContext(browser,role,[],{viewport:{width:+process.env.W||1300,height:900}});
  if(process.env.SEED) seed(db); if(db.profiles){ db.profiles[0].finance_enabled=true; db.profiles[0].finance_hidden=false; db.profiles[0].howto_dismissed=['*']; }
  const page=await ctx.newPage(); const errs=[]; let cur='';
  page.on('pageerror',e=>errs.push(cur+' :: '+e.message));
  page.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource|net::|PDF tool|cdnjs|postcodes/i.test(m.text())) errs.push(cur+' :: console: '+m.text().slice(0,200)); });
  await login(page,port);
  const site = ['home','hs','mc','snagging','pricebuilder','price','checkin','schedule','drawings','team','materials','materialorders','todos','messages','materialrequests','repairjobs','handover','calendar','ppe','plant','materialrequired','expenses','client-info','activity','finance'];
  const fin = ['','/jobs','/sales','/sales/apps','/sales/invoices','/purchases','/purchases/invoices','/purchases/orders','/purchases/statements','/purchases/yard','/purchases/plant','/purchases/pricebook','/subs','/labour','/reports','/directory','/settings','/inbox','/payments','/cis','/payrun','/codes','/rates'];
  const jobfin = ['','/budget','/costs','/contract','/variations','/monthly','/programme','/shopping','/summary','/reports'];
  const top = ['home','sites','hub','calendar','dashboard','dashboards','deliveries','driver','hr','inbox','my-messages','onsite','operatives','outstanding','rams-library','reports','general-reports','sign-templates','signature','sitemap','subapplications','suppliers','team','templates','to-book','todos','vehicle-checklists','account','companylibrary','coshh-substances','operative-dashboard','onboarding-checklist'];
  const routes = [...top.map(t=>'#/'+t), ...site.map(s=>'#/site/'+S1+'/'+s), ...fin.map(f=>'#/finance'+f), ...jobfin.map(f=>'#/site/'+S1+'/finance'+f)];
  const blank=[];
  for(const r of routes){
    cur=r; await page.evaluate(h=>{ location.hash=h; }, r); await page.waitForTimeout(1300);
    const info = await page.evaluate(()=>({t:(document.getElementById('app')||{}).innerText||'', h:location.hash}));
    if(/Something went wrong loading this page/.test(info.t)) errs.push(r+' :: RENDER FAILED');
    if(info.t.trim().length<30) blank.push(r);
  }
  console.log('ROLE', role, 'routes', routes.length);
  console.log('BLANK', JSON.stringify(blank));
  console.log('ERRS', errs.length); errs.forEach(e=>console.log(' -', e.slice(0,300)));
  process.exit(0);
})();
