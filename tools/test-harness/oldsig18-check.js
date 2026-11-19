// The current app's My Signature (app.html#/signature): one save at a time (Andy, 18 Nov 2026: "when saving signature,
// it doesn't save but lets me click multiple times, now my screens froze"). Draw, press Save twice quickly: one file,
// the button says Saving… meanwhile, then it's adopted and the page moves on. Fake database. node oldsig18-check.js
const {chromium, makeContext, serve, login} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const {srv, port} = await serve();
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  const me = db.profiles.find((p) => p.id === 'me'); me.signature_path = null;
  // A slow upload, as on a weak signal; count them.
  let uploads = 0;
  await ctx.route(/\/storage\/v1\/object\/signatures\//, async (r) => { uploads += 1; await new Promise((ok) => setTimeout(ok, 1500)); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({Key: 'signatures/x'})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await login(page, port);
  await page.evaluate(() => { location.hash = '#/signature'; }); await page.waitForTimeout(2000);
  const c = await page.locator('#sigCanvas').boundingBox();
  await page.mouse.move(c.x + 30, c.y + 50); await page.mouse.down(); await page.mouse.move(c.x + 150, c.y + 90, {steps: 10}); await page.mouse.move(c.x + 260, c.y + 40, {steps: 10}); await page.mouse.up();
  await page.click('#sigSaveBtn'); await page.waitForTimeout(150);
  const label = await page.evaluate(() => { const b = document.getElementById('sigSaveBtn'); return b ? [b.textContent, b.disabled] : null; });
  check(!!label && label[0] === 'Saving…' && label[1] === true, `while saving the button says Saving… and can't be pressed (${JSON.stringify(label)})`);
  await page.evaluate(() => { const b = document.getElementById('sigSaveBtn'); if (b) { b.disabled = false; b.click(); } }); // a second press anyway
  await page.waitForTimeout(3500);
  check(uploads === 1, `one save, not two (${uploads} upload${uploads === 1 ? '' : 's'})`);
  check(!!me.signature_path && /^me\/signature-\d+\.png$/.test(me.signature_path), `the signature is adopted (${me.signature_path})`);
  check(!/#\/signature$/.test(await page.evaluate(() => location.hash)), `and the page moves on (${await page.evaluate(() => location.hash)})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close(); srv.close();
})();
