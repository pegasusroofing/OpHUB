// Schedule of Works extras: import tasks from a CSV, add a document and make it managers-only,
// tag a task to a subcontractor; and Price: put a tile in a new colour group.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs'), path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
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
  await page.screenshot({path:'shots/sow-extra.png'});
  // + Section ▾ › Import schedule › From Excel or CSV (Andy, 11 Nov: + Add Task and + Section ▾ above the tasks).
  const more = ()=>page.getByRole('button', {name: 'Section', exact: true}).first().click();
  await more(); await page.waitForTimeout(500);
  await page.getByText(/^📊 Import schedule/).click(); await page.waitForTimeout(500);
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📊 From Excel or CSV', {exact:true}).click()]);
  await fc.setFiles(csv); await page.waitForTimeout(2500);
  await page.getByText(/★ Scope of works/).click(); await page.waitForTimeout(800); await page.locator('text="Import" >> visible=true').last().click(); await page.waitForTimeout(2000);
  const names = db.schedule_tasks.map(t=>t.name);
  check(names.includes('Fit new battens') && names.includes('Lay membrane') && names.includes('Strip roof'), `the CSV's tasks are added after the existing one (${db.schedule_tasks.map(t=>t.name+'@'+t.position).join(', ')})`);
  await more(); await page.waitForTimeout(500);
  await page.getByText(/^📊 Import schedule/).click(); await page.waitForTimeout(500);
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📎 Add the Schedule of Works document', {exact:true}).click()]);
  await fc.setFiles(doc); await page.waitForTimeout(4000);
  await page.getByText('⋮', {exact:true}).first().click(); await page.waitForTimeout(500);
  await page.getByText('🔒 Managers only', {exact:true}).click(); await page.waitForTimeout(1500);
  const docs = (db.schedule_documents||[]).map(d=>[d.name, d.visibility]);
  check(docs.length === 1 && docs[0][1] === 'managers', `the document is added and made managers-only (${JSON.stringify(docs)})`);
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(5000);
  // A task's ⋯ menu (labelled "More: <task>").
  await page.getByLabel('More: Strip roof', {exact: true}).first().click(); await page.waitForTimeout(500);
  const menu = (await page.evaluate(()=>document.body.innerText)).includes('🏗 Assign to subcontractor');
  if(menu){ await page.getByText('🏗 Assign to subcontractor', {exact:true}).click(); await page.waitForTimeout(500); await page.getByText('Acme Scaffolding', {exact:true}).click(); await page.waitForTimeout(2000); }
  const tagged = db.schedule_tasks.filter(t=>t.subcontractor_company_id).map(t=>t.name);
  check(menu && tagged.length === 1 && tagged[0] === 'Strip roof', `a task's menu tags it to the subcontractor (${JSON.stringify(tagged)})`);
  await page.goto(BASE+'/sites/'+S1+'/price'); await page.waitForTimeout(5000);
  await page.getByLabel('Group this tile').first().click(); await page.waitForTimeout(500);
  await page.getByText('+ New group…', {exact:true}).click(); await page.waitForTimeout(500);
  await page.locator('input >> visible=true').last().fill('Roof areas'); await page.locator('text="OK" >> visible=true').last().click(); await page.waitForTimeout(800);
  await page.waitForTimeout(1500);
  const groups = (db.pricing_element_groups||[]);
  check(groups.length === 1 && groups[0].name === 'Roof areas' && !!groups[0].color && db.pricing_elements[0].group_id === groups[0].id, `Price: a tile goes into a new group with its own colour (${JSON.stringify(groups.map(g=>[g.name, g.color]))}, ${db.pricing_elements[0].group_id || '-'})`);
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0,400)}`);
  await browser.close();
})();
