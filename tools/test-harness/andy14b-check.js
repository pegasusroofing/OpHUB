// Andy's notes of 14 Nov 2026 (2), touch phone, fake database:
//  1. signature boxes: ‹ Page 1 of 2 › sits just above the document, with "1 more page after this one";
//  2. ↶ Undo takes back a box drawn by mistake; 🗑 deletes the box tapped on;
//  3. sending a RAMS to the client: one pop-up, the name with the email below it;
//  4. viewing a RAMS: two-finger pinch and double-tap zoom the pages.
// node andy14b-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const {PDFDocument, StandardFonts} = require(path.join(__dirname, '../../app-native/node_modules/pdf-lib'));
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14'); require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const n of [1, 2]) { const pg = doc.addPage([595, 842]); pg.drawText('RAMS page ' + n, {x: 60, y: 780, size: 22, font}); pg.drawText('Signed: ____________', {x: 60, y: 300, size: 14, font}); }
  const pdf = Buffer.from(await doc.save());
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  const me = db.profiles[0]; me.howto_dismissed = ['*'];
  db.rams_docs = [{id: 'rd1', site_id: S1, org_id: me.org_id, name: 'Method Statement — Roof', doc_type: 'Method Statement', status: 'current', storage_path: 'x/m.pdf', subcontractor_company_id: null, sign_layout: {v: 2, boxes: [{p: 1, w: 'op1', t: 'sig', r: [0.1, 0.6, 0.3, 0.05]}], multi: true}, uploaded_at: new Date().toISOString(), created_at: new Date().toISOString()}];
  db.rams_client_signatures = []; db.sign_layout_templates = [];
  await ctx.route(/storage\/v1\/object\/(public\/|sign\/)?rams-docs\//, (r) => (r.request().method() === 'GET' ? r.fulfill({status: 200, contentType: 'application/pdf', body: pdf}) : r.fallback()));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(4500);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- 1 & 2: signature boxes ----
  await page.goto(B + '/sites/' + S1 + '/hs/rams/boxes/rd1'); await page.waitForTimeout(6000);
  const ov = page.getByTestId('sign-overlay').last();
  await ov.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const nav = await page.getByText(/^Page 1 of 2$/).first().boundingBox(), ovb = await ov.boundingBox();
  check(nav && nav.y < ovb.y && ovb.y - (nav.y + nav.height) < 60, `‹ Page 1 of 2 › sits just above the document (${Math.round(ovb.y - (nav.y + nav.height))}px gap)`);
  check(await page.getByText('1 more page after this one ›').count() === 1, 'it says there is 1 more page');
  await page.screenshot({path: path.join(SHOTS, 'b-boxes-nav.png')});
  const drag = async (x0, y0, x1, y1) => { const b = await ov.boundingBox(); await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0); await page.mouse.down(); await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(300); };
  const count = async () => page.evaluate(() => [...document.querySelectorAll('[data-testid="sign-overlay"] > div')].filter((d) => /sign|name|date/.test(d.textContent || '')).length);
  const n0 = await count();
  await page.getByText(/^Signature( ✓\d*)?$/).first().click(); await page.waitForTimeout(300);
  await ov.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await drag(0.1, 0.2, 0.4, 0.26); await drag(0.5, 0.2, 0.8, 0.26);
  const n2 = await count();
  check(n2 === n0 + 2, `two boxes drawn (${n0} → ${n2})`);
  await page.getByText('↶ Undo', {exact: true}).first().click(); await page.waitForTimeout(400);
  check(await count() === n0 + 1, 'Undo takes the last one back');
  // nothing tapped yet: 🗑 says what to do
  await page.getByText('🗑 Delete', {exact: true}).first().click(); await page.waitForTimeout(400);
  check(/Tap a box on the page first/.test(await page.locator('body').innerText()), '🗑 with nothing tapped says to tap a box first');
  await page.getByText(/Tap a box on the page first/).first().click(); await page.waitForTimeout(300);
  // Drawing is still on (the help line says which box is next): tap that button again to turn it off.
  const help = await page.getByText(/^Drag a box where/).first().innerText().catch(() => '');
  const on = (help.match(/(signature|name|date) goes/) || [])[1];
  if (on) { await page.getByText(new RegExp(`^${on[0].toUpperCase()}${on.slice(1)}( ✓\\d*)?$`)).first().click(); await page.waitForTimeout(300); }
  check(await page.getByText(/^Drag a box where/).count() === 0, `drawing turned off (was: ${on || 'off'})`);
  // tap the box left from the first drag, then 🗑
  await ov.evaluate((e) => e.scrollIntoView({block: 'center'})); await page.waitForTimeout(400);
  const b = await ov.boundingBox(); await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.23); await page.waitForTimeout(400);
  await page.getByText(/^🗑 (Delete|\d+)$/).first().click(); await page.waitForTimeout(400);
  check(await count() === n0, `🗑 deletes the box tapped on (${await count()} left, was ${n0})`);
  await page.getByText('↶ Undo', {exact: true}).first().click(); await page.waitForTimeout(300);
  check(await count() === n0 + 1, 'and Undo brings it back');
  await page.screenshot({path: path.join(SHOTS, 'b-boxes-undo.png')});
  await page.getByLabel('Next page').first().click(); await page.waitForTimeout(800);
  check(await page.getByText(/^Page 2 of 2$/).count() === 1 && await page.getByText(/more page/).count() === 0, '› goes to page 2');

  // ---- 3: sending to the client: one pop-up, name then email (Andy, 14 Nov 2026) ----
  const sent = []; global.__fn = (name, body) => { if (name === 'client-sign') { sent.push(body); return {ok: true, id: 'cs1'}; } return undefined; };
  await page.goto(B + '/sites/' + S1 + '/hs/rams'); await page.waitForTimeout(5000);
  const vp = page.viewportSize();
  const sendLine = page.getByText(/Send to client to sign/).first();
  await sendLine.scrollIntoViewIfNeeded(); await sendLine.click(); await page.waitForTimeout(800);
  const nm = await page.getByLabel('Client name').first().boundingBox(), em = await page.getByLabel('Client email').first().boundingBox();
  check(/Send To Client To Sign/.test(await page.locator('body').innerText()) && nm && em && nm.y < em.y, 'one pop-up: Name, with Email below it');
  await page.getByLabel('Client name').first().fill('Sue Client');
  await page.getByLabel('Client email').first().fill('');
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(500);
  check(/Enter a valid email address/.test(await page.locator('body').innerText()) && await page.getByLabel('Client name').count() === 1 && !sent.length, 'no email: it says so and stays open');
  await page.getByLabel('Client email').first().fill('sue@example.com');
  await page.screenshot({path: path.join(SHOTS, 'b-client-one.png')});
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(sent.length === 1 && sent[0].client_email === 'sue@example.com' && sent[0].client_name === 'Sue Client' && sent[0].rams_id === 'rd1', `Send sends it, with the name and email (${JSON.stringify(sent[0] || {})})`);
  check(await page.getByLabel('Client name').count() === 0 && !/Client’s name/.test(await page.locator('body').innerText()), 'and no second pop-up follows');
  global.__fn = undefined;

  // ---- 4: viewer zoom ----
  await page.getByText('View', {exact: true}).first().click(); await page.waitForTimeout(5000);
  const cw = () => page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].filter((x) => x.getBoundingClientRect().width > 0); return c.length ? Math.round(c[0].getBoundingClientRect().width) : 0; });
  const w0 = await cw();
  check(w0 > 200, `the RAMS opens in the viewer (${w0}px wide)`);
  const cdp = await ctx.newCDPSession(page);
  const mid = {x: vp.width / 2, y: vp.height / 2};
  const pts = (d) => [{x: mid.x - d, y: mid.y, id: 1}, {x: mid.x + d, y: mid.y, id: 2}];
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: pts(40)});
  for (let d = 50; d <= 120; d += 10) { await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: pts(d)}); await page.waitForTimeout(30); }
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await page.waitForTimeout(600);
  const w1 = await cw();
  check(w1 > w0 * 2.5, `two-finger pinch zooms in (${w0} → ${w1}px)`);
  await page.screenshot({path: path.join(SHOTS, 'b-viewer-pinch.png')});
  await page.touchscreen.tap(mid.x, mid.y); await page.waitForTimeout(120); await page.touchscreen.tap(mid.x, mid.y); await page.waitForTimeout(600);
  const w2 = await cw();
  check(Math.abs(w2 - w0) < 3, `double-tap goes back to normal (${w2}px)`);
  await page.touchscreen.tap(mid.x, mid.y); await page.waitForTimeout(120); await page.touchscreen.tap(mid.x, mid.y); await page.waitForTimeout(600);
  const w3 = await cw();
  check(w3 > w0 * 2.3, `double-tap zooms in (${w3}px)`);
  await page.getByLabel('Zoom out').first().click(); await page.waitForTimeout(400);
  check(await cw() < w3, 'the − button still works');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
