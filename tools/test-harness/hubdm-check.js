// PM / admin HUB lists unread messages sent to them alone (a delivery problem on a job, a time-off note
// with no job); read ones don't show. Inbox rows tap through and show the kind.
const {chromium, makeContext, S1} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const me = db.profiles[0].id;
  db.messages = (db.messages||[]).concat([
    {id:'dm1', site_id:S1, audience:'single', recipient_id:me, sender_id:'o1', parent_id:null, kind:'grn_problem', related_id:'m1', body:'2 slates broken on delivery', created_at:new Date().toISOString()},
    {id:'dm2', site_id:null, audience:'single', recipient_id:me, sender_id:'o1', parent_id:null, kind:'general', body:'Time off request: Fri 7 Nov', created_at:new Date().toISOString()},
    {id:'dm3', site_id:null, audience:'single', recipient_id:me, sender_id:'o1', parent_id:null, kind:'general', body:'Already read one', created_at:new Date().toISOString()}]);
  db.message_reads = (db.message_reads||[]).concat([{id:'mr1', message_id:'dm3', user_id:me}]);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/pm/hub'); await page.waitForTimeout(7000);
  console.log('hub: delivery problem', await page.getByText('2 slates broken on delivery').count(), '| time off', await page.getByText('Time off request: Fri 7 Nov').count(), '| read one', await page.getByText('Already read one').count());
  await page.screenshot({path:'shots/hubdm.png'});
  await page.getByText('Time off request: Fri 7 Nov').first().click(); await page.waitForTimeout(3000);
  console.log('tap → ', page.url().replace('http://localhost:8081',''));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
