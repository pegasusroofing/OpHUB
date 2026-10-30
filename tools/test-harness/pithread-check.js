// Finance queries a purchase invoice → the job's PM gets a message; the PM's reply shows under "Conversation With The PM";
// Finance replies → added to the thread and the PM told. A rejected invoice can be approved again.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const st = db.sites.find(s=>s.id===S1), org = st.org_id; st.responsible_pm_id = 'pm9';
  db.profiles.push({id:'pm9', name:'Pat PM', role:'pm', org_id:org, email:'pat@x.co'});
  db.purchase_invoices = [{id:'pi1', org_id:org, site_id:S1, supplier_name:'SIG', invoice_no:'INV-9', invoice_date:'2026-10-20', net:100, vat:20, total:120, status:'to_approve', cost_code:'materials'},
                          {id:'pi2', org_id:org, site_id:S1, supplier_name:'Jewson', invoice_no:'J-1', invoice_date:'2026-10-20', net:50, vat:10, total:60, status:'rejected', cost_code:'materials'}];
  db.messages = db.messages || [];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d=>d.accept());
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/pinv/pi1'); await page.waitForTimeout(6000);
  await page.getByText('Query', {exact:true}).click(); await page.waitForTimeout(800);
  await page.locator('input >> visible=true').last().fill('Price looks high'); await page.locator('text="OK" >> visible=true').last().click(); await page.waitForTimeout(3000);
  console.log('status', db.purchase_invoices[0].status, '| message to PM', JSON.stringify(db.messages.filter(m=>m.recipient_id==='pm9').map(m=>[m.kind, m.body])));
  db.purchase_invoices[0].query_thread = [{by:'pm9', name:'Pat PM', at:new Date().toISOString(), text:'Agreed with SIG, it is right'}];
  await page.reload(); await page.waitForTimeout(6000);
  console.log('pm reply shown', await page.getByText('Agreed with SIG, it is right').count());
  await page.getByPlaceholder('Reply to the PM…').fill('Thanks, approving'); await page.getByText('Send', {exact:true}).click(); await page.waitForTimeout(3000);
  console.log('thread', db.purchase_invoices[0].query_thread.length, '| messages to PM', db.messages.filter(m=>m.recipient_id==='pm9').length);
  await page.goto('http://localhost:8081/fin/pinv/pi2'); await page.waitForTimeout(5000);
  console.log('rejected: approve button', await page.getByText('✓ Approve').count());
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
