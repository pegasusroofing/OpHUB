// Live snag photo › Mark up › pen stroke + circle › Save: the marked copy replaces the photo on the snag.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  const png = await page.evaluate(()=>{ const c = document.createElement('canvas'); c.width = 600; c.height = 450; const x = c.getContext('2d'); x.fillStyle = '#9ab'; x.fillRect(0,0,600,450); return c.toDataURL('image/png'); });
  await page.route('**/storage/v1/object/**/snags/old.jpg*', r=>r.request().method()!=='GET' ? r.fallback() : r.fulfill({status:200, contentType:'image/png', body:Buffer.from(png.split(',')[1], 'base64')}));
  db.snags = [{id:'sn1', site_id:S1, title:'Cracked tile', location:'Front slope', photo_path:S1+'/snags/old.jpg', photo_paths:[S1+'/snags/old.jpg'], status:'open', created_at:new Date().toISOString()}];
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/snagging/list'); await page.waitForTimeout(6000);
  // Snags are compact rows: tap one open to see its photos (11 Nov).
  await page.getByRole('button', {name: 'Cracked tile', exact: true}).first().click(); await page.waitForTimeout(2000);
  const box = await page.evaluate(()=>{ const d = [...document.querySelectorAll('div')].find(x=>{ const r = x.getBoundingClientRect(); return Math.round(r.width)===72 && Math.round(r.height)===72; }); if(!d) return null; const r = d.getBoundingClientRect(); return {x: r.x + 36, y: r.y + 36}; });
  check(!!box, 'the open snag shows its photo');
  if (box) {
    await page.mouse.click(box.x, box.y); await page.waitForTimeout(800);
    await page.getByText('✏️ Mark Up (Draw / Add Text)', {exact:true}).click(); await page.waitForTimeout(3000);
    await page.getByLabel('White').click();
    const vp = page.viewportSize(), cx = vp.width/2, cy = vp.height*0.6;
    await page.mouse.move(cx-100, cy); await page.mouse.down(); await page.mouse.move(cx, cy+40, {steps:6}); await page.mouse.move(cx+80, cy-20, {steps:6}); await page.mouse.up();
    await page.getByText('◯ Circle', {exact:true}).click();
    await page.mouse.move(cx-60, cy-80); await page.mouse.down(); await page.mouse.move(cx+60, cy-10, {steps:5}); await page.mouse.up(); await page.waitForTimeout(400);
    await page.screenshot({path:'shots/snag-markup.png'});
    await page.getByText('Save', {exact:true}).click(); await page.waitForTimeout(4000);
  }
  const paths = db.snags[0].photo_paths || [];
  check(paths.length === 1 && paths[0] !== S1+'/snags/old.jpg' && db.snags[0].photo_path === paths[0], `the marked-up copy replaces the photo on the snag (${JSON.stringify(paths)})`);
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0,400)}`);
  await browser.close();
})();
