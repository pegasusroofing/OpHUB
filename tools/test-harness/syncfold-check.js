// Job Settings & Admin › OneDrive sync folder: Manual Sync pulls new top-level files into Drawings (skips ones already
// there) and stamps Last synced; Unlink clears the folder.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); Object.assign(st, {onedrive_folder_id:'F1', onedrive_folder_name:'Studley Rd', onedrive_drive_id:null});
  db.drawing_files = [{id:'df1', site_id:S1, folder_id:null, name:'old.pdf', storage_path:'x/old.pdf'}];
  global.__fn = (name, b) => {
    if (name === 'onedrive-list-folders') return {folders:[], files:[{id:'a', name:'old.pdf'}, {id:'b', name:'Roof plan.pdf'}]};
    if (name === 'onedrive-download-file') return {content_base64: Buffer.from('%PDF-1.4').toString('base64')};
  };
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.accept());
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/admin'); await page.waitForTimeout(6000);
  const t = page.getByText(/Site set up/).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(500); }
  await page.getByText(/Manual Sync/).first().click(); await page.waitForTimeout(5000);
  console.log('drawings', db.drawing_files.map(f=>f.name).join(', '), '| last synced set', !!st.onedrive_last_synced_at);
  await page.getByText('Unlink folder', {exact:true}).click(); await page.waitForTimeout(600);
  await page.locator('text="Unlink" >> visible=true').last().click(); await page.waitForTimeout(2500);
  console.log('folder after unlink', st.onedrive_folder_id);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
