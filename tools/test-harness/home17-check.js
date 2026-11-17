// Phone Home for managers (Andy, 17 Nov 2026: "can we remove the large tiles for dashboard, hr please they're in the
// sidebar now. And the name role and sign out from the bottom of the page, that's in the sidebar too"). On a phone:
// no Dashboards or HR tile and no name / role / Sign out at the foot of Home or the projects list; all of them are in
// the ☰ menu. The laptop keeps its Dashboards tile. Also the roles board's part names: Quotes, and See Prices And
// Price Builder.
// node home17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'home17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', howto_dismissed: ['*']});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  await page.goto(B + '/home'); await page.waitForTimeout(4000);
  let t = await body();
  check(/Reports & Surveys/.test(t) && /\nAdmin\n/.test(t), 'phone Home: Reports & Surveys and Admin tiles still there');
  check(!/Company, operatives & deliveries|deliver(y|ies) to schedule\n/.test(t) && !/\nDashboards\n/.test(t), 'phone Home: no Dashboards tile');
  check(!/Holidays, policies & handbook/.test(t), 'phone Home: no HR tile');
  check(!/Sign out/i.test(t) && !/Company Admin/.test(t), 'phone Home: no name, role or Sign out at the foot');
  await page.screenshot({path: path.join(SHOTS, 'home-phone.png'), fullPage: true});
  await page.getByLabel('Open the menu', {exact: true}).first().click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Dashboards/.test(t) && /Sign out/.test(t) && /Andy Admin/.test(t), 'the ☰ menu has Dashboards, the name and Sign out');
  await page.screenshot({path: path.join(SHOTS, 'menu-phone.png')});

  await page.goto(B + '/sites'); await page.waitForTimeout(4000);
  check(!/Sign out/i.test(await body()), 'phone projects list: no Sign out at the foot');

  // Laptop: the Dashboards tile stays; Sign out only in the bar on the left.
  await page.setViewportSize({width: 1300, height: 900}); await page.goto(B + '/home'); await page.waitForTimeout(4000);
  t = await body();
  check(/Company, operatives & deliveries|deliver(y|ies) to schedule/.test(t), 'laptop Home: Dashboards tile still there');
  check(await page.getByText('Sign out', {exact: true}).filter({visible: true}).count() === 1, 'laptop: Sign out only in the bar on the left');

  // The roles board's names.
  await page.goto(B + '/pm/admin/roles'); await page.waitForTimeout(4000);
  t = await body();
  check(/See Prices And Price Builder/.test(t) && /\nQuotes\n/.test(t) && !/Quotes And Price Builder/.test(t), 'roles board: Quotes, and See Prices And Price Builder');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
