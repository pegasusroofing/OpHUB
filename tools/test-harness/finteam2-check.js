// Finance › Team: Give Finance to an operative → Finance on, made a manager, old role saved; Switch off → operative again.
const {chromium, makeContext} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/team'); await page.waitForTimeout(6000);
  const jake = () => db.profiles.find(p=>p.id==='o1');
  const row = page.locator('div', {hasText:'Jake Morris'}).filter({has: page.getByText('Give Finance', {exact:true})}).last();
  await row.getByText('Give Finance', {exact:true}).click(); await page.waitForTimeout(600);
  await page.locator('text="Give Finance" >> visible=true').last().click(); await page.waitForTimeout(3000);
  console.log('on:', JSON.stringify({fin:jake().finance_enabled, role:jake().role, prev:jake().finance_prev_role}));
  await page.locator('div', {hasText:'Jake Morris'}).filter({has: page.getByText('Switch off', {exact:true})}).last().getByText('Switch off', {exact:true}).click(); await page.waitForTimeout(3000);
  console.log('off:', JSON.stringify({fin:jake().finance_enabled, role:jake().role, prev:jake().finance_prev_role}));
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
