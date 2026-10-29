// Report with a drawing: + Add another item, tick Add to drawing, mark up (place the number and a cross), save, and check what was saved.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  const png = await page.evaluate(()=>{ const c = document.createElement('canvas'); c.width = 800; c.height = 560; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,800,560); x.strokeStyle = '#333'; x.lineWidth = 6; x.strokeRect(60,60,680,440); return c.toDataURL('image/png'); });
  db.report_submissions = [{id:'rs1', org_id:db.profiles[0].org_id, site_id:S1, template_id:null, template_name:'Roof survey', status:'in_progress', submitted_by:db.profiles[0].id, submitted_at:new Date().toISOString(),
    sections:[{id:'s1', title:'Roof', items:[{id:'d1', type:'drawing', label:'Roof plan'}, {id:'q1', type:'choice', label:'Item 1', options:['Good','Poor']}]}], answers:{d1:[png], d1__orig:[png], d1__ops:[[]]}}];
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/snagging/reports/fill/rs1'); await page.waitForTimeout(6000);
  await page.getByText('+ Add another item', {exact:true}).click(); await page.waitForTimeout(600);
  await page.getByText('📍 Add to drawing', {exact:true}).first().click(); await page.waitForTimeout(600);
  const t1 = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  console.log('item 2 added:', t1.includes('Item 2'), '| ticked:', t1.includes('1 item ticked so far'));
  await page.getByText('✏️ Mark up', {exact:true}).click(); await page.waitForTimeout(2500);
  console.log('editor:', (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').match(/Tap the drawing[^.]*\./)?.[0]);
  const vp = page.viewportSize();
  await page.getByText('+', {exact:true}).click(); await page.waitForTimeout(500);
  await page.mouse.click(vp.width/2, vp.height*0.62); await page.waitForTimeout(500);
  await page.getByText('✕ Cross', {exact:true}).click(); await page.waitForTimeout(300);
  await page.mouse.click(vp.width/2 - 120, vp.height*0.62); await page.waitForTimeout(500);
  await page.screenshot({path:'shots/markup.png'});
  await page.getByText('Save', {exact:true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Save & Exit', {exact:true}).click(); await page.waitForTimeout(5000);
  const a = db.report_submissions[0].answers;
  console.log(errs.join(' / ') || 'no errors');
  console.log('ops', JSON.stringify(a.d1__ops), '| dnum', a.q1__dnum, '| image', String(a.d1[0]).slice(0,40), '| items', (db.report_submissions[0].sections[0].items||[]).map(i=>i.label).join(', '));
  await browser.close(); process.exit(0);
})();
