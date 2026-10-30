// My certificates › Email all: pick a PM from the list, CC me → sent to them with me copied.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = []; let sent = null;
  global.__fn = (name, body) => { if (name === 'send-document-email') { sent = body; return {ok:true}; } };
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id;
  db.profiles.push({id:'pm2', org_id:org, name:'Pete Manager', email:'pete@rtb.co', role:'pm'});
  db.operative_certifications = [{id:'oc1', org_id:org, operative_id:'me', user_id:'me', name:'CSCS', category:'cscs', source:'upload', storage_path:'me/cscs.jpg', created_at:'2026-10-01'}];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/dashboard'); await page.waitForTimeout(6000);
  if (!(await page.getByText('✉️ Email all').count())) { await page.getByText(/^Certifications [(]/).click(); await page.waitForTimeout(500); }
  await page.getByText('✉️ Email all').click(); await page.waitForTimeout(600);
  await page.screenshot({path:'shots/certemail.png'});
  await page.getByText(/Pete Manager/).click(); await page.waitForTimeout(500);
  await page.getByText('Yes', {exact:true}).last().click(); await page.waitForTimeout(6000);
  console.log('sent to:', sent && sent.recipient_email, '| cc:', sent && sent.cc_email);
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
