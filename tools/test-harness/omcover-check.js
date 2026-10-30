// O&M cover: 📷 Take / upload → choose from library → the cover photo is saved on the manual.
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
  const img = path.join(os.tmpdir(), 'cover.png'); fs.writeFileSync(img, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
  await page.getByText('📷 Take / upload').click(); await page.waitForTimeout(400);
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText('🖼 Choose from library').click()]);
  await fc.setFiles(img); await page.waitForTimeout(6000);
  console.log('cover photo:', JSON.stringify(db.handover_om_manuals[0].data.cover.coverPhoto || null));
  await page.screenshot({path:'shots/omcover.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
