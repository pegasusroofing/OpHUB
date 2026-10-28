const {chromium,makeContext,serve,login}=require('./harness');
const seed=require('./fresh/seed');
(async()=>{
  const {srv,port}=await serve(); const browser=await chromium.launch(); const errs=[];
  const W=+process.env.W||1400;
  const {ctx,db}=await makeContext(browser,process.env.ROLE||'admin',[],{viewport:{width:W,height:+process.env.H||1000}, ...(W<500?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})}); seed(db);
  db.profiles[0].finance_enabled=true; db.profiles[0].finance_hidden=false; db.profiles[0].howto_dismissed=['*'];
  if(process.env.EXTRA) require(process.env.EXTRA)(db);
  const fs=require('fs'); await ctx.route(/exceljs.*\.js/, r=>r.fulfill({status:200, contentType:'application/javascript', body:fs.readFileSync(__dirname+'/node_modules/exceljs/dist/exceljs.min.js','utf8')}));
  await ctx.route(/pdf-lib.*\.js/, r=>r.fulfill({status:200, contentType:'application/javascript', body:fs.readFileSync(__dirname+'/node_modules/pdf-lib/dist/pdf-lib.min.js','utf8')}));
  const page=await ctx.newPage(); page.on('pageerror',e=>errs.push(e.message)); await login(page,port);
  global.page=page; global.db=db;
  const routes=(process.env.ROUTES||'#/finance/jobs').split(',');
  for(const r of routes){ await page.evaluate(h=>go(h.replace(/SID(\d)/g,(m,i)=>SITES[+i]&&SITES[+i].id)), r); await page.waitForTimeout(+process.env.WAIT||2500);
    if(process.env.ACT) await page.evaluate(process.env.ACT).catch(e=>console.log('act err',e.message));
    if(process.env.ACT) await page.waitForTimeout(1200);
    if(process.env.EVAL) console.log('EVAL', JSON.stringify(await page.evaluate(process.env.EVAL)).slice(0,3000));
    const f='shots/s1'+r.replace(/[#\/]/g,'_')+'-'+(process.env.TAG||W)+'.png';
    await page.screenshot({path:f, fullPage:!process.env.NOFULL}); console.log('shot',f, await page.evaluate(()=>location.hash)); }
  console.log('errors', errs.join('|')||'none'); process.exit(0); })();
