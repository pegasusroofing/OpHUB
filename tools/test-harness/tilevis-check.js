// H&S › Tools, HAVS & PUWER: HAVS tile ⋮ › Show to Operatives saves sites.tile_visibility; Materials › Plant ⋮ the same for materials_visibility.
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
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/hs/havspuwer'); await page.waitForTimeout(5000);
  await page.getByLabel('Who sees HAVS').click(); await page.waitForTimeout(600);
  await page.getByText('👁 Show to Operatives', {exact:true}).click(); await page.waitForTimeout(2000);
  const tv = db.sites.find(s=>s.id===S1).tile_visibility || {};
  check(page.url().includes('/hs/havspuwer') && JSON.stringify(tv).includes('operative'), 'HAVS ⋮ › Show to Operatives saves the tile visibility and stays on the page (' + JSON.stringify(tv) + ')');
  await page.goto(BASE+'/sites/'+S1+'/materials'); await page.waitForTimeout(5000);
  await page.getByLabel('Who can see Plant', {exact: true}).click(); // the row's ⋯ (11 Nov) await page.waitForTimeout(600);
  await page.getByText('👁 Show to Operatives', {exact:true}).click(); await page.waitForTimeout(2000);
  const mv = db.sites.find(s=>s.id===S1).materials_visibility || {};
  check(JSON.stringify(mv).includes('operative'), 'Materials › Plant ⋯ › Show to Operatives saves the Materials visibility (' + JSON.stringify(mv) + ')');
  check(!errs.length, 'no page errors ' + errs.join(' / ').slice(0,400));
  await browser.close();
})();
