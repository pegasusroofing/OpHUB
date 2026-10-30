// COSHH library (admin): Delete all folders and documents → two questions → library empty.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.coshh_library_folders = [{id:'cf1', org_id:org, name:'Paints', parent_id:null}, {id:'cf2', org_id:org, name:'Gloss', parent_id:'cf1'}];
  db.coshh_library_files = [{id:'lf1', org_id:org, folder_id:'cf2', name:'a.pdf', storage_path:'x/a.pdf', uploaded_at:'2026-10-01'}, {id:'lf2', org_id:org, folder_id:null, name:'b.pdf', storage_path:'x/b.pdf', uploaded_at:'2026-10-01'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/pm/admin/coshh'); await page.waitForTimeout(6000);
  const fl = page.getByText(/Folders/).first(); if (await fl.count()) { await fl.click(); await page.waitForTimeout(800); }
  const b = page.getByText('🗑 Delete all folders and documents');
  console.log('wipe button:', await b.count());
  await b.click(); await page.waitForTimeout(400);
  await page.getByText('Delete all', {exact:true}).last().click(); await page.waitForTimeout(400);
  await page.getByText('Delete all', {exact:true}).last().click(); await page.waitForTimeout(3000);
  console.log('left: folders', db.coshh_library_folders.length, 'files', db.coshh_library_files.length);
  await page.screenshot({path:'shots/coshwipe.png'});
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
