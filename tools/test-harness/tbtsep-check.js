// Completed toolbox talks: tick two → Email 2 → address starts as the responsible PM → one email with two signed PDFs.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const st = db.sites.find(s=>s.id===S1); st.responsible_pm_id = 'pm9';
  db.profiles.push({id:'pm9', name:'Pat PM', role:'pm', org_id:st.org_id, email:'pat@x.co'});
  db.toolbox_talks = [1,2].map(i=>({id:'t'+i, site_id:S1, org_id:st.org_id, title:'Talk '+i, storage_path:'t'+i+'.pdf', status:'completed', created_by:'me', created_at:'2026-10-2'+i+'T09:00:00Z', subcontractor_company_id:null}));
  db.toolbox_talk_signatures = [{id:'s1', tbt_id:'t1', user_id:'o1', signed_at:'2026-10-21T10:00:00Z'}, {id:'s2', tbt_id:'t2', user_id:'o1', signed_at:'2026-10-22T10:00:00Z'}];
  const sent = []; global.__fn = (name, b) => { console.log('FN', name); if (name === 'send-document-email') { sent.push(b); return {ok:true}; } };
  await ctx.route((u) => /rams-docs.t[12].pdf/.test(String(u)), r => r.request().method()==='GET' ? r.fulfill({status:200, contentType:'application/pdf', body: require('fs').readFileSync(require('path').join(__dirname,'shots','appsow.pdf'))}) : r.fallback());
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites/'+S1+'/hs/tbt'); await page.waitForTimeout(6000);
  await page.getByText(/^Completed/).first().click(); await page.waitForTimeout(800);
  await page.getByText('Tick all', {exact:true}).click(); await page.waitForTimeout(300);
  await page.getByText('✉ Email 2', {exact:true}).click(); await page.waitForTimeout(1500);
  console.log('address prefilled:', await page.locator('input >> visible=true').last().inputValue());
  await page.locator('text="OK" >> visible=true').last().click(); for (let i=0;i<8;i++){ await page.waitForTimeout(1000); const t=(await page.evaluate(()=>document.body.innerText)).match(/(Nothing to email.*|Could not.*|.*emailed.*|Building.*)/); if(t) console.log('T', t[0].slice(0,120)); } await page.screenshot({path:'shots/tbtsep.png'}); console.log('page', (await page.evaluate(()=>document.body.innerText)).replace(/s+/g,' ').slice(-400));
  console.log('emails', sent.length, '| files', sent[0] && (sent[0].files||[]).map(f=>f.name).join(', '), '| to', sent[0] && sent[0].recipient_email);
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
