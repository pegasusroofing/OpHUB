// Drawings folder ⋮ › Who can see this › only the ticked people › Save, then check the row.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db);
  db.drawing_folders = [{id:'df1', site_id:S1, parent_id:null, name:'Roof Plans', position:0, visibility_mode:'all', assigned_pm_ids:[], assigned_operative_ids:[]}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/drawings'); await page.waitForTimeout(6000);
  await page.getByText('⋮', {exact:true}).first().click(); await page.waitForTimeout(800);
  await page.getByText('🔒 Who can see this', {exact:true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Only the people ticked', {exact:true}).click(); await page.waitForTimeout(500);
  const t = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' '); const i = t.indexOf('WHO CAN SEE'); console.log(t.slice(i<0?0:i, (i<0?0:i)+300));
  await page.getByText('Save', {exact:true}).click(); await page.waitForTimeout(2500);
  console.log(errs.join(' / ') || 'ok', JSON.stringify(db.drawing_folders[0]));
  await browser.close(); process.exit(0);
})();
