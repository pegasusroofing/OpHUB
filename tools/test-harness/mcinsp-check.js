// MC Inspections: Manage Templates from the job, subcontractor inspections per company;
// snag close asks camera or library; SoW import template in the menu.
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); st.acting_as_main_contractor = true;
  const org = db.profiles[0].org_id;
  db.report_templates = [{id:'rt1', org_id:org, name:'Daily site inspection', description:'Fencing, extinguishers', sections:[], is_mc_inspection:true, archived:false}];
  db.subcontractor_companies = [{id:'sc1', site_id:S1, org_id:org, name:'Brothers Scaffold'}];
  db.subcontractor_inspections = [{id:'si1', subcontractor_company_id:'sc1', site_id:S1, file_name:'Scaffold tag check.pdf', storage_path:'x/y.pdf', folder_id:null, uploaded_by:db.profiles[0].id, uploaded_at:'2026-10-29T09:00:00Z'}];
  db.subcontractor_inspection_folders = [];
  db.snags = [{id:'sn1', site_id:S1, title:'Loose tile', location:'Front', status:'open', created_at:'2026-10-29T09:00:00Z', created_by:db.profiles[0].id}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/mc/inspections'); await page.waitForTimeout(5000);
  await page.getByText('Manage Templates').click(); await page.waitForTimeout(500);
  await page.getByText(/Brothers Scaffold \(1 file\)/).click(); await page.waitForTimeout(500);
  check(await page.getByText('Daily site inspection').count() > 0 && await page.getByText('Scaffold tag check.pdf').count() > 0, 'Manage Templates lists the template, and the subcontractor\'s file under its company');
  await page.screenshot({path:'shots/mcinsp.png', fullPage:true});
  await page.goto(BASE+'/sites/'+S1+'/snagging/list'); await page.waitForTimeout(5000);
  // Snags are compact rows: tap one open to reach Close Snag (11 Nov).
  await page.getByRole('button', {name: 'Loose tile', exact: true}).first().click(); await page.waitForTimeout(600);
  await page.getByText(/Close Snag/).first().click(); await page.waitForTimeout(600);
  check(await page.getByText('🖼 Choose From Library').count() > 0, 'closing a snag asks camera or library for the fix photo');
  await page.screenshot({path:'shots/snagclose.png'});
  await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.waitForTimeout(5000);
  await page.getByRole('button', {name: 'Section', exact: true}).first().click(); await page.waitForTimeout(400);
  const dl = page.waitForEvent('download', {timeout:8000}).catch(()=>null);
  await page.getByText(/^📊 Import schedule/).click(); await page.waitForTimeout(400);
  await page.getByText(/Download the Excel template/).click(); await page.waitForTimeout(800);
  // With OneDrive connected the file asks where to go: Download.
  const dlBtn = page.locator('text="⬇️ Download" >> visible=true'); if (await dlBtn.count()) await dlBtn.last().click();
  const d = await dl;
  check(!!d && /\.xlsx$/i.test(d.suggestedFilename()), `the Schedule of Works import template downloads (${d ? d.suggestedFilename() : 'none'})`);
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0,400)}`);
  await browser.close();
})();
