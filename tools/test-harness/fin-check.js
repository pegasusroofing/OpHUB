// Opens the new app's Finance pages against the fake Supabase and reports page errors and the first words on each page.
// A route written as /path>>Button text also clicks that button and reports the file it downloads.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); try{ require('./seeds/ex1')(db); }catch(e){}
  db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  await ctx.route(/supabase\.co\/rest\/v1\/(?!rpc)/, async route=>{
    const req = route.request();
    if(!/vnd\.pgrst\.object/.test(req.headers()['accept']||'')) return route.fallback();
    const res = await route.fetch().catch(()=>null); let rows = []; try{ rows = res ? await res.json() : []; }catch(e){}
    if(!Array.isArray(rows)) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(rows)});
    if(!rows.length) return route.fulfill({status:406, contentType:'application/json', body:JSON.stringify({code:'PGRST116', message:'no rows'})});
    return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(rows[0])});
  });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  for(const r0 of (process.env.ROUTES||'/fin').split(',')){
    const [r, click] = r0.split('>>');
    errs.length = 0;
    await page.goto(BASE+r.replace('SID0', S1)); await page.waitForTimeout(6000);
    const txt = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,160);
    let dl = '';
    if(click){ try{ const [d] = await Promise.all([page.waitForEvent('download', {timeout:20000}), page.getByText(click, {exact:true}).first().click()]); const p = await d.path(); dl = ' | download '+d.suggestedFilename()+' '+require('fs').statSync(p).size+' bytes'; if(process.env.SAVE) await d.saveAs(require('path').join(process.env.SAVE, d.suggestedFilename())); }catch(e){ dl = ' | NO DOWNLOAD: '+e.message.slice(0,120); } }
    console.log(r+(click?' ['+click+']':'')+dl, '|', errs.length ? 'ERRORS: '+errs.join(' / ').slice(0,300) : 'ok', '|', txt);
  }
  await browser.close(); process.exit(0);
})();
