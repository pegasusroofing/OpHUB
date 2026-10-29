// COSHH Library: pick two Safety Data Sheets at once → two products with their codes read and an assessment each in the folder.
const fs = require('fs'), path = require('path'), os = require('os');
const {chromium, makeContext} = require('./harness');
const { PDFDocument, StandardFonts } = require('pdf-lib');
async function sds(name, use, h){
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const pg = pdf.addPage([595, 842]);
  const lines = ['SECTION 1: Identification of the substance/mixture and of the company/undertaking', '1.1 Product identifier', 'Product name: '+name, '1.2 Relevant identified uses', 'Identified uses: '+use, '1.3 Details of the supplier', 'Company name: Test Supplies Ltd.', 'SECTION 2: Hazards identification', 'Signal word: Warning', 'GHS07', h+' Causes skin irritation.', 'P280 Wear protective gloves.', 'SECTION 4: First aid measures', '4.1 Description of first aid measures', 'Skin contact: Wash with soap and water.', 'SECTION 13: Disposal considerations', '13.1 Waste treatment methods', 'Dispose of as hazardous waste.'];
  lines.forEach((l, i) => pg.drawText(l, {x: 40, y: 800 - i*18, size: 10, font}));
  const f = path.join(os.tmpdir(), name.replace(/\s+/g,'_')+'.pdf'); fs.writeFileSync(f, await pdf.save()); return f;
}
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.coshh_library_folders = [{id:'cf1', org_id:org, name:'Adhesives', parent_id:null, position:0}];
  db.coshh_library_files = []; db.rams_library_items = [];
  const files = [await sds('Gripfill Adhesive', 'Bonding timber', 'H315'), await sds('Roof Sealant X', 'Sealing joints', 'H317')];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/pm/admin/coshh?folder=cf1'); await page.waitForTimeout(5000);
  const f1 = page.getByText('Adhesives', {exact:true}); if (await f1.count()) { await f1.first().click(); await page.waitForTimeout(2500); }
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout:15000}), page.getByText(/^📥 Make assessments from data sheets/).click()]);
  await fc.setFiles(files); await page.waitForTimeout(20000);
  await page.screenshot({path:'shots/coshh-bulk.png'});
  console.log('products:', JSON.stringify((db.rams_library_items||[]).map(p=>[p.title, (p.data||{}).h, !!(p.data||{}).sdsPath, (p.data||{}).assessmentFileId ? 'assessed' : 'not assessed'])));
  console.log('files in folder:', JSON.stringify((db.coshh_library_files||[]).map(f=>[f.name, f.folder_id])));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
