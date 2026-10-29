// Schedule of Works: menu beside the tap, add-section pop-up, add-task row, pre-start photos label, slider to 70%, Complete tab has no Add.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [], cons = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.schedule_sections = [{id:'ss1', site_id:S1, name:'Rear roof', position:1, created_at:'2026-10-01'}];
  db.schedule_tasks = [{id:'st1', site_id:S1, section_id:'ss1', name:'Strip and re-felt', status:'progress', percent_complete:30, position:1, created_at:'2026-10-01'}, {id:'st2', site_id:S1, section_id:null, name:'Clear gutters', status:'todo', position:2, created_at:'2026-10-01'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message)); page.on('console', m=>{ if(m.type()==='error') cons.push(m.text().slice(0,200)); });
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  const t0 = Date.now(); await page.goto(BASE+'/sites/'+S1+'/schedule'); await page.getByText('Clear gutters').first().waitFor({timeout:20000}); console.log('loaded in', Date.now()-t0, 'ms');
  await page.waitForTimeout(1000);
  await page.screenshot({path:'shots/sow-1.png'});
  await page.getByLabel('More').click(); await page.waitForTimeout(600); await page.screenshot({path:'shots/sow-2-more.png'});
  await page.getByText('📁 Add Section').click(); await page.waitForTimeout(600); await page.screenshot({path:'shots/sow-3-section.png'});
  await page.getByPlaceholder('Section name, e.g. Roof Level 1').fill('Front roof'); await page.getByText('Add section', {exact:true}).click(); await page.waitForTimeout(1500);
  console.log('section added:', (db.schedule_sections||[]).map(x=>x.name).join(', '));
  await page.getByText('+ ADD TASK').first().click(); await page.waitForTimeout(500); await page.screenshot({path:'shots/sow-4-addtask.png'});
  await page.getByPlaceholder('New task, e.g. Fit lead flashing').fill('Fit ridge'); await page.getByText('Add', {exact:true}).click(); await page.waitForTimeout(1500);
  console.log('tasks:', db.schedule_tasks.map(x=>x.name).join(', '));
  // slider: click at 70% of the track
  const tr = page.getByLabel('Progress').first(); const bb = await tr.boundingBox();
  await page.mouse.click(bb.x + bb.width*0.70, bb.y + bb.height/2); await page.waitForTimeout(1500);
  console.log('percent now', db.schedule_tasks.find(x=>x.id==='st1').percent_complete);
  await page.screenshot({path:'shots/sow-5-slider.png'});
  await page.getByText('Complete', {exact:true}).first().click(); await page.waitForTimeout(800);
  const txt = (await page.evaluate(()=>document.body.innerText));
  console.log('complete tab has add task:', /ADD TASK/.test(txt));
  await page.screenshot({path:'shots/sow-6-complete.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none', '| console', cons.slice(0,4).join(' / '));
  await browser.close(); process.exit(0);
})();
