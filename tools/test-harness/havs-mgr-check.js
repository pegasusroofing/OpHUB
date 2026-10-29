// HAVS manager: add a tool to the site, log minutes for an operative on Monday, Save & Close the week, then see it under Completed HAVS.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); const org = db.profiles[0].org_id;
  db.havs_tools = [{id:'ht1', org_id:org, name:'breaker', vibration_magnitude:12, active:true, sort_order:1}];
  db.site_havs_tools = []; db.havs_entries = []; db.havs_weekly_completions = [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.accept());
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/hs/havs'); await page.waitForTimeout(5000);
  await page.getByText('Breaker · 12', {exact:true}).click(); await page.waitForTimeout(2500);
  await page.getByText(/^Monday/).first().click(); await page.waitForTimeout(800);
  await page.getByPlaceholder('Mins').first().fill('60');
  await page.getByText('Save Minutes', {exact:true}).click(); await page.waitForTimeout(2500);
  console.log('site tools', JSON.stringify(db.site_havs_tools), '| entries', JSON.stringify(db.havs_entries.map(e=>[e.user_id, e.minutes, e.entry_date])));
  const t = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' '); const i = t.indexOf(' pts'); console.log('day:', t.slice(Math.max(0,i-40), i+30));
  await page.getByText('Save & Close for the Week', {exact:true}).click(); await page.waitForTimeout(2500);
  await page.getByText('Completed HAVS', {exact:true}).click(); await page.waitForTimeout(2500);
  const t2 = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' '); const j = t2.indexOf('Completed HAVS');
  console.log('completions', db.havs_weekly_completions.length, '|', t2.slice(j, j+120), '|', errs.join(' / ') || 'no errors');
  await browser.close(); process.exit(0);
})();
