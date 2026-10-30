// Job Inbox (manager): tapping an "Invoice query" message opens the query page; a "Delivery problem" opens Materials.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'pm', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const org = db.profiles[0].org_id, now = new Date().toISOString();
  db.messages = [
    {id:'m1', org_id:org, site_id:S1, sender_id:'o1', audience:'single', recipient_id:'me', kind:'pi_query', body:'Query on Jewson invoice 123', related_id:'pi9', parent_id:null, created_at:now},
    {id:'m2', org_id:org, site_id:S1, sender_id:'o1', audience:'single', recipient_id:'me', kind:'grn_problem', body:'Delivery problem: 2 tiles short', related_id:null, parent_id:null, created_at:now},
  ];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto(BASE+'/sites/'+S1+'/messages'); await page.waitForTimeout(5000);
  await page.getByText('Query on Jewson invoice 123').click(); await page.waitForTimeout(2500);
  console.log('invoice query opens:', page.url().replace(BASE,''));
  await page.goto(BASE+'/sites/'+S1+'/messages'); await page.waitForTimeout(5000);
  await page.getByText('Delivery problem: 2 tiles short').click(); await page.waitForTimeout(2500);
  console.log('delivery problem opens:', page.url().replace(BASE,''));
  console.log('errors', errs.join(' / ').slice(0,400) || 'none');
  await browser.close(); process.exit(0);
})();
