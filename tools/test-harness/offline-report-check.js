// Report with no signal: answer, go offline, Save & Exit parks it on the device; back online it sends itself.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db);
  db.report_submissions = [{id:'rs2', org_id:db.profiles[0].org_id, site_id:S1, template_id:null, template_name:'Roof survey', status:'in_progress', submitted_by:db.profiles[0].id, submitted_at:new Date().toISOString(),
    sections:[{id:'s1', title:'Roof', items:[{id:'q1', type:'text', label:'Ridge'}]}], answers:{}}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>{ console.log('alert:', d.message().slice(0,90)); d.accept(); });
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/snagging/reports/fill/rs2'); await page.waitForTimeout(6000);
  await page.locator('textarea, input').first().fill('Ridge tiles loose');
  const block = r => r.abort('internetdisconnected'); await page.route('**/rest/v1/report_submissions**', block);
  await page.getByText('Save & Exit', {exact:true}).click(); await page.waitForTimeout(4000);
  const t = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  const m = t.match(/No signal[^.]*\./); console.log('message:', m ? m[0] : t.slice(0,200));
  const parked = await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ophub_report_drafts')).map(k=>Object.values(JSON.parse(localStorage[k])).map(p=>p.action+':'+JSON.stringify(p.answers)).join()));
  console.log('parked:', parked.join(' | '), '| server before:', JSON.stringify(db.report_submissions[0].answers));
  await page.unroute('**/rest/v1/report_submissions**', block);
  await page.evaluate(()=>window.dispatchEvent(new Event('online'))); await page.waitForTimeout(5000);
  const left = await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ophub_report_drafts')).map(k=>Object.keys(JSON.parse(localStorage[k])).length));
  console.log('server after:', JSON.stringify(db.report_submissions[0].answers), '| still parked:', left.join(','), '|', errs.join(' / ') || 'no errors');
  await browser.close(); process.exit(0);
})();
