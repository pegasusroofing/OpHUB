// Schedule of Works extras: import tasks from a CSV, add a document and make it managers-only,
// tag a task to a subcontractor; and Price: put a tile in a new colour group.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs'), path = require('path');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db);
  const site = db.sites.find(s=>s.id===S1); site.acting_as_main_contractor = true;
  db.subcontractor_companies = [{id:'sc1', site_id:S1, name:'Acme Scaffolding'}];
  db.schedule_tasks = [{id:'t1', site_id:S1, name:'Strip roof', status:'todo', position:1, section_id:null}];
  const dir = path.join(__dirname, 'shots'); const csv = path.join(dir, 'sow.csv'), doc = path.join(dir, 'Schedule.pdf');
  fs.writeFileSync(csv, 'Ref,Scope of works,Qty\n1.1,Fit new battens,30\n1.2,Lay membrane,20\n'); fs.writeFileSync(doc, '%PDF-1.4\n%%EOF');
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.type()==='prompt' ? d.accept('Roof areas') : d.accept());
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(6000);
  const more = ()=>page.getByText('⋯ More: add section or variation work', {exact:true}).click();
  await more(); await page.waitForTimeout(500);
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📊 Import tasks from Excel / CSV', {exact:true}).click()]);
  await fc.setFiles(csv); await page.waitForTimeout(2500);
  await page.getByText(/★ Scope of works/).click(); await page.waitForTimeout(2000);
  console.log('tasks:', db.schedule_tasks.map(t=>t.name+'@'+t.position).join(', '));
  await more(); await page.waitForTimeout(500);
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📎 Add the Schedule of Works document', {exact:true}).click()]);
  await fc.setFiles(doc); await page.waitForTimeout(4000);
  await page.getByText('⋮', {exact:true}).first().click(); await page.waitForTimeout(500);
  await page.getByText('🔒 Managers only', {exact:true}).click(); await page.waitForTimeout(1500);
  console.log('docs:', JSON.stringify((db.schedule_documents||[]).map(d=>[d.name, d.visibility])));
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(5000);
  const dots = page.getByText('⋮', {exact:true}); const n = await dots.count();
  await dots.nth(n-1).click(); await page.waitForTimeout(500);
  const menu = (await page.evaluate(()=>document.body.innerText)).includes('🏗 Assign to subcontractor');
  if(menu){ await page.getByText('🏗 Assign to subcontractor', {exact:true}).click(); await page.waitForTimeout(500); await page.getByText('Acme Scaffolding', {exact:true}).click(); await page.waitForTimeout(2000); }
  console.log('sub menu:', menu, '| tagged:', JSON.stringify(db.schedule_tasks.filter(t=>t.subcontractor_company_id).map(t=>t.name)));
  await page.goto(BASE+'/sites/'+S1+'/price'); await page.waitForTimeout(5000);
  await page.getByLabel('Group this tile').first().click(); await page.waitForTimeout(500);
  await page.getByText('+ New group…', {exact:true}).click(); await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  console.log('groups:', JSON.stringify((db.pricing_element_groups||[]).map(g=>[g.name, g.color])), '| e1 group:', db.pricing_elements[0].group_id || '-');
  console.log(errs.join(' / ') || 'no errors');
  await browser.close(); process.exit(0);
})();
