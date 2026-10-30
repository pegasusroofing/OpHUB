// Small items: 🗑 on a live TBT; Add to collections with a question; Programme tile makes its folder;
// incident date + time boxes; calendar "Also add" opens the new delivery.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1), org = st.org_id; st.acting_as_main_contractor = true;
  db.toolbox_talks = [{id:'t1', site_id:S1, org_id:org, title:'Ladders', storage_path:'t.pdf', status:'live', created_by:'me', created_at:'2026-10-20T09:00:00Z', subcontractor_company_id:null}];
  db.toolbox_talk_signatures = [];
  db.materials = [{id:'m1', site_id:S1, item:'Slates', qty:'10', status:'pending', requested_by:'o1', created_at:'2026-10-20T09:00:00Z'}];
  db.material_required_items = []; db.drawing_folders = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  const yes = async (t) => { await page.waitForTimeout(600); await page.locator(`text="${t}" >> visible=true`).last().click(); await page.waitForTimeout(2500); };
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/tbt'); await page.waitForTimeout(5000);
  const live = page.getByText(/^Live TBT/).first(); if (await live.count()) { await live.click(); await page.waitForTimeout(600); }
  await page.getByLabel('Delete Ladders').click(); await yes('Delete');
  console.log('talks left', db.toolbox_talks.length);
  await page.goto('http://localhost:8081/sites/'+S1+'/materials/requests'); await page.waitForTimeout(5000);
  await page.getByText('📦 Add to collections').click(); await yes('Add');
  console.log('collections', db.material_required_items.map(m=>m.item).join(','), '| request', db.materials[0].status, db.materials[0].order_note);
  await page.goto('http://localhost:8081/sites/'+S1+'/mc'); await page.waitForTimeout(5000);
  await page.getByText(/Programme/).first().click(); await page.waitForTimeout(3000);
  console.log('folder', db.drawing_folders.map(f=>f.name).join(','), '| url', page.url().includes('/drawings/'));
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/incidents/new'); await page.waitForTimeout(5000);
  console.log('time boxes', await page.getByPlaceholder('Time, e.g. 14:30').count());
  await page.getByPlaceholder('Time, e.g. 14:30').first().fill('14:30');
  console.log('time kept', await page.getByPlaceholder('Time, e.g. 14:30').first().inputValue());
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
