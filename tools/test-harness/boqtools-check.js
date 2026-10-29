// BoQ tools: tick a section, 25% margin on the ticked lines, plot per line, cost rate, insert under a heading, autosave, Excel export.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}, acceptDownloads:true});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const org = db.profiles[0].org_id;
  const st = db.sites.find(s=>s.id===S1); st.multi_site = true;
  db.site_sub_addresses = [{id:'pa', site_id:S1, name:'Plot 1'},{id:'pb', site_id:S1, name:'Plot 2'}];
  db.fin_contract_items = [
    {id:'c1', org_id:org, site_id:S1, position:0, kind:'section', description:'Main roof', value:0},
    {id:'c2', org_id:org, site_id:S1, position:1, kind:'item', description:'Strip and re-felt', qty:100, unit:'m2', rate:30, value:3000},
    {id:'c3', org_id:org, site_id:S1, position:2, kind:'item', description:'Lead flashings', value:1000},
    {id:'c4', org_id:org, site_id:S1, position:3, kind:'section', description:'Garage', value:0},
    {id:'c5', org_id:org, site_id:S1, position:4, kind:'item', description:'Felt garage', value:500}];
  db.job_finance = [{site_id:S1, org_id:org, billing_type:'application'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/fin/job/'+S1+'/boq'); await page.waitForTimeout(6000);
  await page.getByLabel('Tick').first().click(); await page.waitForTimeout(300); // the Main roof section → its 2 items
  await page.getByPlaceholder('%').fill('25');
  await page.getByText('Apply to 2 ticked').click(); await page.waitForTimeout(300);
  await page.getByText('Untick all').click();
  await page.getByPlaceholder('Cost £').last().fill('400'); // lump-sum line: cost typed
  const plots = page.getByLabel('Plot'); await plots.nth(0).click(); await page.waitForTimeout(400); await page.getByText('Plot 2', {exact:true}).last().click(); await page.waitForTimeout(300);
  await page.getByText('⋯').nth(3).click(); await page.waitForTimeout(400); await page.getByText('+ Item under this heading').click(); await page.waitForTimeout(300);
  await page.getByPlaceholder('Description').last().fill('Garage gutter'); await page.getByPlaceholder('Lump sum £').last().fill('120');
  await page.screenshot({path:'shots/boq-tools.png', fullPage:true});
  await page.waitForTimeout(6000); // autosave
  const items = db.fin_contract_items.slice().sort((a,b)=>a.position-b.position).map(r=>[r.position, r.kind, r.description, r.value, r.cost, r.cost_basis||'', r.cost_pct??'', r.sub_job_id||'']);
  console.log(JSON.stringify(items));
  const [dl] = await Promise.all([page.waitForEvent('download', {timeout:15000}).catch(()=>null), page.getByText('📊 Excel').click()]);
  console.log('excel:', dl ? dl.suggestedFilename() : 'none');
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
