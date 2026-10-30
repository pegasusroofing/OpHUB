// Signature boxes: draw, move, tap to select and save, on a real PDF page, at laptop and at phone width (the same drawing layer phones use).
const {chromium, makeContext, S1} = require('./harness');
const {PDFDocument, StandardFonts} = require(require('path').join(__dirname,'../../app-native/node_modules/pdf-lib'));
const B = 'http://localhost:8081';
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const n of [1,2]) { const pg = doc.addPage([595, 842]); pg.drawText('Method statement page '+n, {x:60, y:780, size:22, font}); pg.drawText('Signed: ____________', {x:60, y:640, size:14, font}); }
  const pdf = Buffer.from(await doc.save());
  for (const vp of [{width:1300,height:1000},{width:390,height:844}]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:vp});
    db.profiles[0].howto_dismissed = ['*'];
    db.rams_docs = [{id:'rd1', site_id:S1, org_id:db.profiles[0].org_id, name:'Method.pdf', storage_path:'x/m.pdf', sign_layout:null, created_at:new Date().toISOString()}];
    db.sign_layout_templates = [];
    await ctx.route(/storage\/v1\/object\/(public\/|sign\/)?rams-docs\//, r=>r.request().method()==='GET' ? r.fulfill({status:200, contentType:'application/pdf', body:pdf}) : r.fallback());
    const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
    await page.goto(B+'/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
    await page.goto(B+'/sites/'+S1+'/hs/rams/boxes/rd1'); await page.waitForTimeout(7000);
    const ov = page.getByTestId('sign-overlay');
    const drag = async (x0,y0,x1,y1) => { await ov.scrollIntoViewIfNeeded(); const b = await ov.boundingBox(); await page.mouse.move(b.x+b.width*x0,b.y+b.height*y0); await page.mouse.down(); await page.mouse.move(b.x+b.width*(x0+x1)/2,b.y+b.height*(y0+y1)/2,{steps:3}); await page.mouse.move(b.x+b.width*x1,b.y+b.height*y1,{steps:3}); await page.mouse.up(); await page.waitForTimeout(400); };
    const box = await ov.boundingBox(); console.log(vp.width, 'page size', Math.round(box.width), Math.round(box.height));
    await page.getByText(/^Signature$/).first().click(); await page.waitForTimeout(300);
    await drag(0.1,0.2,0.4,0.28);
    await drag(0.5,0.2,0.7,0.28);
    await page.screenshot({path:`shots/signbox-${vp.width}.png`});
    // The Date button is now on: turn it off, drag the first box somewhere else, tap the second to select it.
    await page.getByText(/^Date/).first().click(); await page.waitForTimeout(300);
    await drag(0.2,0.24,0.3,0.6);
    await ov.scrollIntoViewIfNeeded(); const b2 = await ov.boundingBox(); await page.mouse.click(b2.x+b2.width*0.6, b2.y+b2.height*0.24); await page.waitForTimeout(400);
    console.log('selected:', await page.getByText(/^Selected:/).first().innerText().catch(()=>'none'));
    await page.screenshot({path:`shots/signbox-${vp.width}-b.png`});
    await page.getByText('Save signature boxes', {exact:true}).click(); await page.waitForTimeout(2500);
    const l = db.rams_docs[0].sign_layout; console.log('saved', JSON.stringify(l && (l.boxes||l)).slice(0,300));
    await ctx.close();
  }
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
