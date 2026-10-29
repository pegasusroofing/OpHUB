// sds-check.js: attaches a Safety Data Sheet PDF (SDS=path) to a COSHH product against the fake Supabase and prints what was filled in.
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
    db.todos = [{id:'td1', org_id:org, site_id:S1, text:'Chase scaffold handover cert', done:false, assigned_to:uid, date_required_by:d, created_at:new Date().toISOString()}];
    db.handover_om_manuals = [{id:'om1', site_id:S1, org_id:org, name:'O&M Manual', data:null, created_at:new Date().toISOString()}];
    db.price_rate_items = [{id:'ri1', org_id:org, category:'Pitched Roofing', name:'Strip and re-slate', unit:'m2', is_dropdown:false, rate:12.5, active:true, sort_order:1},{id:'ri2', org_id:org, category:'Roofline', name:'Valleys', unit:'lm', is_dropdown:true, rate:null, active:true, sort_order:2}];
    db.price_rate_options = [{id:'ro1', rate_item_id:'ri2', label:'Lead', rate:40, sort_order:1},{id:'ro2', rate_item_id:'ri2', label:'None', rate:0, sort_order:2}];
    db.pricing_elements = [{id:'el1', site_id:S1, name:'Flat Roofing', price_total:5000, sort_order:0, created_at:new Date().toISOString()},{id:'el2', site_id:S1, name:'Main roof', price_total:1325, sort_order:1, created_at:new Date().toISOString()}];
    db.price_weeks = [{element_id:'el1', site_id:S1, week_number:1, amount:900}];
    db.price_week_operative_entries = [{id:'pe1', site_id:S1, element_id:'el1', week_number:1, operative_id:null, kind:'cost', label:'Plant hire', amount:900}];
    db.price_builder_sheets = [{id:'ps1', org_id:org, site_id:S1, title:'Draft roof', status:'draft', assigned_user_ids:[], created_at:new Date().toISOString()},{id:'ps2', org_id:org, site_id:S1, title:'Main roof', status:'issued', total:1325, pricing_element_id:'el2', assigned_user_ids:[], issued_at:new Date().toISOString(), created_at:new Date().toISOString()}];
    db.price_builder_sheet_items = [{id:'si1', sheet_id:'ps2', rate_item_id:'ri1', category:'Pitched Roofing', name:'Strip and re-slate', unit:'m2', rate:12.5, quantity:50, option_id:null, option_label:null, is_manual_rate:false, line_total:625, sort_order:0},{id:'si2', sheet_id:'ps2', rate_item_id:'ri2', category:'Roofline', name:'Valleys', unit:'lm', rate:40, quantity:17.5, option_id:'ro1', option_label:'Lead', is_manual_rate:false, line_total:700, sort_order:1}];
    db.price_builder_sheet_item_weeks = [];
    db.repair_jobs = [{id:'rj1', site_id:S1, org_id:org, job_number:'R1', address:'1 High St', description:'Leak', created_at:new Date().toISOString(), job_status:'Approved - To Do', quote_approved:true, quote_approved_at:new Date().toISOString(), closed:false, works_completed:false}]; }
  db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  // Attach a data sheet to a new COSHH product (SDS env = path to the PDF) and see what's filled in
  (db.rams_library_items = db.rams_library_items || []).push({id:'cp1', org_id:db.profiles[0].org_id, kind:'coshh', title:'New product', data:{}});
  await page.goto(BASE+'/pm/admin/coshh/cp1'); await page.waitForTimeout(6000);
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText('Add data sheet (PDF)', {exact:true}).click()]);
  await fc.setFiles(process.env.SDS); await page.waitForTimeout(10000);
  const vals = await page.evaluate(()=>Array.from(document.querySelectorAll('input,textarea')).map(e=>e.value).filter(Boolean));
  console.log('filled:', JSON.stringify(vals).slice(0, 900));
  console.log('errors:', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
