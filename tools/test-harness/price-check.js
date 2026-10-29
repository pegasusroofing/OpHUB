// price-check.js: books work into the Price tile (a weekly build-up, a Price Sheet week, a draft sheet) against the fake Supabase and prints the figures. Run with EXTRA=1.
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
    db.delivery_tasks = [{id:'dt1', org_id:org, site_id:S1, scheduled_date:d, time_slot:'7am', description:'Slates x 2 pallets', status:'scheduled', high_priority:true}];
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
  const txt = async()=> (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  const m = (t, re)=> (t.match(re)||[''])[0];
  // 1. ordinary element: Jake £300 in week 2
  await page.goto(BASE+'/sites/'+S1+'/price/el1'); await page.waitForTimeout(6000);
  await page.getByPlaceholder('0.00').nth(1).fill('300'); await page.getByPlaceholder('0.00').nth(1).blur(); await page.waitForTimeout(3000);
  let t = await txt(); console.log('el1:', m(t, /Booked In £[\d,.]+/), '| rows', db.price_week_operative_entries.length, '| weeks', JSON.stringify(db.price_weeks));
  // 2. sheet element: qty 10 on line 1, wage 125, Save
  await page.goto(BASE+'/sites/'+S1+'/price/el2'); await page.waitForTimeout(6000);
  await page.getByPlaceholder('Qty').first().fill('10');
  await page.getByPlaceholder('0.00').first().fill('125'); await page.getByPlaceholder('0.00').first().blur(); await page.waitForTimeout(2500);
  await page.getByText('💾 Save', {exact:true}).click(); await page.waitForTimeout(3500);
  t = await txt(); console.log('el2:', m(t, /Booked In £[\d,.]+/), '| item weeks', JSON.stringify(db.price_builder_sheet_item_weeks), '| weeks', JSON.stringify(db.price_weeks.filter(w=>w.element_id==='el2')));
  // 3. draft builder: tick, qty, save draft
  await page.goto(BASE+'/sites/'+S1+'/price/sheets/ps1'); await page.waitForTimeout(6000);
  await page.getByText('Strip and re-slate — £12.50 / m²').click(); await page.waitForTimeout(500);
  await page.getByText('Next — enter quantities').click(); await page.waitForTimeout(800);
  await page.getByPlaceholder('Qty').first().fill('20'); await page.getByPlaceholder('Qty').first().blur(); await page.waitForTimeout(500);
  t = await txt(); console.log('ps1 total:', m(t, /Total £[\d,.]+/));
  await page.getByText('Save Draft', {exact:true}).click(); await page.waitForTimeout(3000);
  console.log('ps1 saved items:', JSON.stringify((db.price_builder_sheet_items||[]).filter(i=>i.sheet_id==='ps1').map(i=>[i.name,i.quantity,i.line_total])), 'sheet total', (db.price_builder_sheets.find(x=>x.id==='ps1')||{}).total);
  // 4. issue the draft: name the tile, confirm; check the tile, access and Schedule of Works tasks
  page.on('dialog', d => d.type()==='prompt' ? d.accept('Pitched roof') : d.accept());
  page.on('response', async r => { if(r.request().method()!=='GET' && /pricing_elements|schedule_sections/.test(r.url())) console.log('net:', r.request().method(), r.url().split('/rest/v1/')[1], r.status(), (await r.text().catch(()=>'')).slice(0,160)); });
  await page.getByText('Issue', {exact:true}).click(); await page.waitForTimeout(5000);
  const ps1 = db.price_builder_sheets.find(x=>x.id==='ps1');
  const tile = (db.pricing_elements||[]).find(e=>e.id===ps1.pricing_element_id);
  console.log('issue:', ps1.status, '| tile', tile && tile.name, tile && tile.price_total, '| SOW tasks', JSON.stringify((db.schedule_tasks||[]).filter(t=>t.section_id===ps1.schedule_section_id).map(t=>t.name)));
  console.log('debug:', ps1.pricing_element_id, JSON.stringify((db.pricing_elements||[]).map(e=>[e.id,e.name,e.price_total])), JSON.stringify(db.site_price_access||null));
  console.log('errors:', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
