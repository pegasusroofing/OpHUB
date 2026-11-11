// The admin's set-up guide on the home page (Andy, 11 Nov 2026): shows, minimises, a step opens its page, closes. Phone, fake database.
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['home', 'hr', 'calendar'];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const t = await page.locator('body').innerText();
  check(/Set Up .* Of \d+ Done/.test(t) && /Link OneDrive/.test(t) && /Choose Who Approves Holidays/.test(t), 'the set-up guide shows on the admin home');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'guide-home.png')});
  await page.getByRole('button', {name: 'Choose Who Approves Holidays'}).click(); await page.waitForTimeout(3000);
  check(/\/pm\/hr\/holidays/.test(page.url()), 'a step opens its page');
  await page.goto(B + '/home'); await page.waitForTimeout(4000);
  await page.locator('[aria-label="Minimise"] >> visible=true').first().click(); await page.waitForTimeout(800);
  check(/Tap to carry on/.test(await page.locator('body').innerText()) && (me.howto_dismissed || []).includes('guide:min'), 'minimised to one line, and remembered');
  await page.locator('[aria-label="Close the set-up guide"] >> visible=true').first().click(); await page.waitForTimeout(800);
  check(!/Set Up .* Done/.test(await page.locator('body').innerText()) && me.howto_dismissed.includes('guide:closed'), 'closed, and remembered');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
