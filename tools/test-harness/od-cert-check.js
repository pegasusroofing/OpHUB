// Operative page: the OneDrive Sync card shows when the company has OneDrive connected.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); const org = db.profiles[0].org_id;
  db.onedrive_connections = [{org_id:org, account_email:'od@x.test', folder_path:'/', connected_at:'2026-10-01'}];
  const op = db.profiles.find(p=>p.role==='operative'); op.onedrive_folder_id = 'F1'; op.onedrive_folder_name = 'Certs - '+op.name;
  db.operative_certifications = (db.operative_certifications||[]).concat([{id:'oc1', org_id:org, operative_id:op.id, name:'CSCS', category:'cscs', source:'upload', created_at:'2026-10-01'}]);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/pm/operatives/'+op.id); await page.waitForTimeout(6000);
  const t = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  const i = t.indexOf('OneDrive Sync');
  console.log(errs.join(' / ') || 'ok', '|', i<0 ? 'NO CARD: '+t.slice(0,300) : t.slice(i, i+300));
  await browser.close(); process.exit(0);
})();
