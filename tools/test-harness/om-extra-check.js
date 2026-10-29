// O&M: a data sheet added to the job after the manual started comes in; pick from the COSHH Library; attach a file to a row.
const fs = require('fs'), os = require('os'), path = require('path');
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id, now = new Date().toISOString();
  const data = { cover:{title:'O&M'}, attach:{coshh:true}, appendix:[], syncInit:1, synced:{d1:1}, sections:[
    {id:'sc', key:'scope', type:'text', title:'1. Scope of Works', body:'Re-roof'},
    {id:'m', type:'materials', title:'3. Materials Log', columns:['Log No.','Element','Product','Manufacturer'], rows:[['1','','Bauder K5','Bauder']], links:[[{docId:'d1', name:'Bauder K5.pdf'}]]},
    {id:'g', type:'table', title:'4. Guarantees & Warranties', columns:['Item','Ref','Expiry','Maintenance'], rows:[['','','','']], links:[[]]} ] };
  db.handover_om_manuals = [{id:'om1', site_id:S1, org_id:org, name:'O&M Manual', data, created_at:now}];
  db.handover_docs = [{id:'d1', site_id:S1, kind:'datasheet', name:'Bauder K5.pdf', storage_path:'a.pdf', position:0, created_at:now},{id:'d2', site_id:S1, kind:'guarantee', name:'Roof guarantee.pdf', provider:'Bauder', ref:'G1', expiry_date:'2046-10-29', storage_path:'g.pdf', position:1, created_at:now}];
  db.coshh_docs = [];
  db.rams_library_items = [{id:'p1', org_id:org, kind:'coshh', title:'Gripfill Adhesive', data:{manufacturer:'Everbuild', sdsPath:'lib/gf.pdf', h:['H315'], p:[], pictos:[]}}];
  db.coshh_library_files = []; db.coshh_library_folders = [];
  const f = path.join(os.tmpdir(), 'Ridge_vent_spec.pdf'); fs.writeFileSync(f, '%PDF-1.4\n%%EOF');
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/om/om1'); await page.waitForTimeout(6000);
  console.log('guarantee row after open:', JSON.stringify(db.handover_om_manuals[0].data.sections[2].rows[0]));
  await page.getByText('📚 Choose data sheets from the COSHH Library').click(); await page.waitForTimeout(2000);
  await page.getByText('Gripfill Adhesive').click(); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/om-lib.png'});
  await page.getByText(/^Add 1 ticked$/).click(); await page.waitForTimeout(500);
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText('📎 Attach').first().click()]);
  await fc.setFiles(f); await page.waitForTimeout(4000);
  await page.screenshot({path:'shots/om-rows.png', fullPage:true});
  const m = db.handover_om_manuals[0].data.sections[1];
  console.log('materials rows:', JSON.stringify(m.rows), 'links:', JSON.stringify(m.links.map(l=>(l||[]).map(x=>x.name))));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
