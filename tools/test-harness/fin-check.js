// Opens the new app's Finance pages against the fake Supabase and reports page errors and the first words on each page.
// A route written as /path>>Button text also clicks that button and reports the file it downloads.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); try{ require('./seeds/ex1')(db); }catch(e){}
  if(process.env.EXTRA){ const d = new Date().toISOString().slice(0,10), org = db.profiles[0].org_id, uid = db.profiles[0].id;
    db.delivery_tasks = [{id:'dt1', org_id:org, site_id:S1, scheduled_date:d, time_slot:'first', description:'Slates x 2 pallets', status:'scheduled', high_priority:true}];
    db.ppe_issuances = [{id:'pp1', org_id:org, user_id:uid, site_id:S1, items:['Gloves','Hard Hat'], status:'signed', issued_at:new Date().toISOString(), issued_by:uid}];
    db.fin_sub_apps = [{id:'sa1', org_id:org, site_id:S1, subcontract_id:'sc1', number:1, app_date:d, final_date:d, applied_gross:5000, certified_gross:4500, retention:225, contra:0, previous:0, net_due:4275, cis_deduction:855, pay_amount:3420, payless:true, payless_reason:'Snagging not finished on plots 3-4', status:'certified'}];
    db.repair_jobs = [{id:'rj1', site_id:S1, org_id:org, job_number:'R1', address:'1 High St', description:'Leak', created_at:new Date().toISOString(), job_status:'Approved - To Do', quote_approved:true, quote_approved_at:new Date().toISOString(), closed:false, works_completed:false}]; }
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
