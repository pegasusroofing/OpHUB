// Operative's certificates (manager): Select → tick one → "☁ Upload 1 to OneDrive" sends only that one.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  db.operative_certifications = [{id:'c1', operative_id:'o1', category:'cscs_card', name:'CSCS card', storage_path:'o1/a.pdf', source:'upload', created_at:'2026-10-01'},
                                 {id:'c2', operative_id:'o1', category:'smsts', name:'SMSTS', storage_path:'o1/b.pdf', source:'upload', created_at:'2026-10-02'}];
  const calls = []; global.__fn = (name, b) => { if (name === 'sync-operative-certification') { calls.push(b); return {pushed:(b.cert_ids||[]).length}; } };
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/pm/operatives/o1'); await page.waitForTimeout(6000); 
  await page.getByText('☑ Select to export or email').click(); await page.waitForTimeout(400);
  await page.getByText('☐').first().click(); await page.waitForTimeout(300);
  await page.getByText('☁ Upload 1 to OneDrive').click(); await page.waitForTimeout(3000);
  console.log('calls', JSON.stringify(calls.map(c=>c.cert_ids)));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
