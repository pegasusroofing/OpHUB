// Quotes › Export on a phone doesn't jump into the list's search box (no keyboard over the choices); on a laptop it still
// does, so you can type straight away (Andy, 11 Nov 2026). Fake database.
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const run = async (browser, phone) => {
  const opts = phone ? {shot: true} : {viewport: {width: 1300, height: 900}}; // shot: a touch phone, 390 wide
  const {ctx, db} = await makeContext(browser, 'admin', [], opts);
  require('./seeds/world')(db); db.profiles.find((p) => p.id === 'me').role = 'admin';
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/pm/quotes'); await page.waitForTimeout(4500);
  const who = phone ? 'phone' : 'laptop';
  await page.locator('[aria-label="Export"] >> visible=true').first().click(); await page.waitForTimeout(1200);
  check(/What To Export/.test(await page.locator('body').innerText()), `${who}: Export opens the choices`);
  const box = page.locator('input[placeholder="Type to search…"] >> visible=true');
  const has = await box.count();
  const focused = await page.evaluate(() => (document.activeElement && document.activeElement.getAttribute('placeholder')) || '');
  if (phone) {
    const typing = await page.evaluate(() => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName); });
    check(!typing && focused !== 'Type to search…', 'phone: nothing to type in is selected, so no keyboard');
    check(await page.locator('[aria-label="Search the list"] >> visible=true').count() === 1, 'phone: the search line is there to tap');
    await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'export-phone-nokb.png')});
    await page.locator('[aria-label="Search the list"] >> visible=true').first().click(); await page.waitForTimeout(600);
    const now = await page.evaluate(() => (document.activeElement && document.activeElement.getAttribute('placeholder')) || '');
    check(now === 'Type to search…', 'phone: tapping it gives the box to type in');
    const before = await page.locator('[role="dialog"] >> visible=true').innerText().catch(() => '');
    await page.keyboard.type('zzzz'); await page.waitForTimeout(500);
    const after = await page.locator('[role="dialog"] >> visible=true').innerText().catch(() => '');
    check(after.length < before.length || !before, 'phone: typing narrows the list');
  } else check(!has || focused === 'Type to search…', 'laptop: the search box is ready to type in');
  check(!errs.length, `${who}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
};
(async () => {
  const browser = await chromium.launch();
  await run(browser, true); await run(browser, false);
  await browser.close();
})();
