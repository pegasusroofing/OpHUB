// A PM prices a site variation after Finance's copy exists: opening Finance › Variations fills quoted
// (and agreed value once agreed) — but never over a price Finance typed.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  db.variations = [{id:'v1', site_id:S1, description:'Extra flashing', cost_impact:'£450', approval_status:'approved', created_at:'2026-10-20T09:00:00Z'},
                   {id:'v2', site_id:S1, description:'Gutter', cost_impact:'300', approval_status:'pending', created_at:'2026-10-21T09:00:00Z'}];
  db.fin_variations = [{id:'f1', org_id:org, site_id:S1, seq:1, number:'V001', title:'Extra flashing', variation_id:'v1', status:'agreed', quoted:null, agreed_value:null},
                       {id:'f2', org_id:org, site_id:S1, seq:2, number:'V002', title:'Gutter', variation_id:'v2', status:'submitted', quoted:275, agreed_value:null}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/job/'+S1+'/variations'); await page.waitForTimeout(6000);
  console.log('f1', JSON.stringify({q:db.fin_variations[0].quoted, a:db.fin_variations[0].agreed_value}), '| f2 kept', db.fin_variations[1].quoted, '| rows', db.fin_variations.length);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
