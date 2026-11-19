// Toolbox Talks Required (Andy, 19 Nov 2026: "the how often does a toolbox talk is always open even tho it has been
// entered, and it needs compacting its a massive section now"). Once it's set it's one line with ✎ Edit; Edit opens the
// choice; Save closes it again. Fake database, laptop size. node tbtrule19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
  db.organizations[0].tbt_every = 'month'; db.tbt_templates = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/pm/admin/tbt'); await page.waitForTimeout(4000);
  let t = await text();
  check(/Toolbox Talks Required: Every Month/.test(t) && !/How Often Does Each Live Project/.test(t), 'once set, it is one line');
  await page.screenshot({path: path.join(__dirname, 'shots', 'tbtrule19-closed.png')});
  await page.getByText('✎ Edit', {exact: true}).first().click(); await page.waitForTimeout(700);
  t = await text();
  check(/How Often Does Each Live Project/.test(t) && /Cancel/.test(t), '✎ Edit opens the choice, with Save and Cancel');
  await page.locator('[aria-label="Toolbox Talks Required"] >> visible=true').first().click().catch(() => page.getByText('Every Month', {exact: true}).first().click());
  await page.waitForTimeout(600);
  await page.getByText('Every 2 Weeks', {exact: true}).last().click().catch(() => undefined); await page.waitForTimeout(500);
  await page.getByText('Save', {exact: true}).first().click(); await page.waitForTimeout(2000);
  t = await text();
  check(db.organizations[0].tbt_every !== 'month' && /Toolbox Talks Required: /.test(t) && !/How Often Does Each Live Project/.test(t), `Save keeps the new choice (${db.organizations[0].tbt_every}) and closes it`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
