// Search: typing finds projects and people; Ctrl+K opens it from Home.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(2500);
  console.log('ctrl+k →', page.url().replace(BASE,''));
  const box = page.locator('input[placeholder^="🔍 Search projects, people"]:visible');
  for(const q of ['jake','cleve']){ await box.fill(q); await page.waitForTimeout(2000); const t = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' '); const i = t.search(/PROJECTS|PEOPLE|Nothing found/); console.log(q, '→', t.slice(i, i+120)); }
  console.log(errs.join(' / ') || 'no errors');
  await browser.close(); process.exit(0);
})();
