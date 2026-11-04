// Why won't a button press? node probe-press.js <route> <label> [<label>…]
// Loads the screen against the fake database as admin, tries each button, and prints Playwright's reason.
const {chromium, makeContext} = require('./harness');
const B = 'http://localhost:8081';
const [route, ...labels] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + route); await page.waitForTimeout(3000);
  for (const l of labels) {
    const el = page.getByText(l, {exact: false}).first();
    const info = await el.evaluate((x) => { const b = x.closest('[tabindex="0"],[role="button"],button') || x; const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return {tag: b.tagName, r: [r.left, r.top, r.width, r.height].map(Math.round), op: cs.opacity, pe: cs.pointerEvents, dis: b.getAttribute('aria-disabled'), sh: document.documentElement.scrollHeight, ih: innerHeight}; }).catch((e) => 'no element: ' + e.message.slice(0, 80));
    console.log(l, JSON.stringify(info));
    try { await el.click({timeout: 2000}); console.log('  pressed ok'); } catch (e) { console.log('  FAIL', e.message.split('\n').slice(0, 8).join(' | ').slice(0, 600)); }
    await page.screenshot({path: 'shots/job/probe-' + labels.indexOf(l) + 'a.png'}); await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.screenshot({path: 'shots/job/probe-' + labels.indexOf(l) + 'b.png'});
  }
  await page.screenshot({path: 'shots/job/probe-press.png'});
  await browser.close();
})();
