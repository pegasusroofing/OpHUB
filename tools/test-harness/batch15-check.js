// Money strip ⋯ margin basis; Overview tile ⋯ menus; application site progress: per-line Use, variations, confirm list, Not on site schedule.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const pop = (page, t) => page.locator(`text="${t}" >> visible=true`).last().click();
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  const ap = db.fin_applications.find(a=>a.id==='ap2');
  const items = (ap.lines||[]).filter(l=>l.kind==='item'); ap.variations[0].pct = 30;
  console.log('lines', items.map(l=>[l.description,l.pct]).join(' | '), '| vars', JSON.stringify(ap.variations||[]).slice(0,200));
  db.schedule_tasks = [{id:'t1', site_id:S1, contract_item_id:items[0].item_id, status:'in_progress', percent_complete:90, section_id:'sx'},
    {id:'t2', site_id:S1, section_id:'sv', status:'in_progress', percent_complete:60}];
  (db.fin_variations||[]).filter(v=>v.site_id===S1).forEach(v=>{ v.schedule_section_id='sv'; });
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(B+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  // Strip
  await page.goto(B+'/sites/'+S1); await page.waitForTimeout(6000);
  const strip = async () => (await page.getByText(/^on £|^Nothing .* yet$/).first().innerText().catch(()=>'-'));
  console.log('strip auto:', await strip());
  await page.getByLabel('Measure margin against').click(); await page.waitForTimeout(600);
  await page.screenshot({path:'shots/margin-menu.png'});
  await pop(page, 'Invoiced'); await page.waitForTimeout(800);
  console.log('strip invoiced:', await strip(), '| still on', page.url().replace(B,''));
  await page.reload(); await page.waitForTimeout(6000);
  console.log('after reload:', await strip());
  // Tiles
  await page.goto(B+'/fin/job/'+S1); await page.waitForTimeout(6000);
  await page.getByLabel('Costs options').click(); await page.waitForTimeout(600);
  await pop(page, 'Materials'); await page.waitForTimeout(800);
  console.log('cost tile', await page.getByText('Materials', {exact:true}).count(), '| url', page.url().replace(B,''));
  await page.getByLabel('Variations options').click(); await page.waitForTimeout(600);
  await pop(page, 'All Day Works'); await page.waitForTimeout(800);
  console.log('dayworks tile', await page.getByText(/day works?$/).count());
  await page.screenshot({path:'shots/ov-tiles.png'});
  // Application
  await page.goto(B+'/fin/job/'+S1+'/application/ap2'); await page.waitForTimeout(7000);
  await page.screenshot({path:'shots/siteprog.png', fullPage:true});
  console.log('not on schedule', await page.getByText(/Not on site schedule/).count(), '| Use tags', await page.getByText(/^ Use$/).count(), '| card', await page.getByText(/Site progress is ahead/).first().innerText().catch(()=>'-'));
  await page.getByText('Use site progress', {exact:true}).click(); await page.waitForTimeout(800);
  const t = await page.locator('body').innerText();
  console.log('confirm', (t.match(/• [^\n]*/g)||[]).join(' ; '));
  await page.screenshot({path:'shots/siteprog-confirm.png'});
  await page.locator('text="Use site progress" >> visible=true').last().click(); await page.waitForTimeout(6000);
  const saved = db.fin_applications.find(a=>a.id==='ap2');
  console.log('saved first line', (saved.lines||[]).find(l=>l.item_id===items[0].item_id).pct, '| vars', (saved.variations||[]).map(v=>v.pct).join(','));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
