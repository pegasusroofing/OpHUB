// A Risk Assessment and Method Statement made together in the RAMS builder (Andy, 14 Nov 2026): add a Client to the
// RA's signature boxes and save → asked "Add the same people to the Method Statement?" → Yes opens the MS with
// Client 1 to place → one tap drops their signature, name and date boxes together → Save. Saving again with nobody new
// doesn't ask; a RAMS not made in the builder doesn't ask. Touch phone, fake database. node signcarry-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const {PDFDocument, StandardFonts} = require(path.join(__dirname, '../../app-native/node_modules/pdf-lib'));
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14'); require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const n of [1, 2]) { const pg = doc.addPage([595, 842]); pg.drawText('Sign-off sheet page ' + n, {x: 60, y: 780, size: 22, font}); pg.drawText('Client: ____________', {x: 60, y: 300, size: 14, font}); }
  const pdf = Buffer.from(await doc.save());
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  const me = db.profiles[0]; me.howto_dismissed = ['*'];
  const op = (p) => ({p, w: 'op1', t: 'sig', r: [0.1, 0.2, 0.3, 0.05]}), pm = {p: 1, w: 'pm', t: 'sig', r: [0.1, 0.1, 0.3, 0.05]};
  db.rams_docs = [
    {id: 'ra1', site_id: S1, org_id: me.org_id, name: 'Risk Assessment — Roof', doc_type: 'Risk Assessment', status: 'current', storage_path: 'x/ra.pdf', sign_layout: {v: 2, boxes: [pm, op(1)], multi: true}, created_at: new Date().toISOString()},
    {id: 'ms1', site_id: S1, org_id: me.org_id, name: 'Method Statement — Roof', doc_type: 'Method Statement', status: 'current', storage_path: 'x/ms.pdf', sign_layout: {v: 2, boxes: [pm, op(1)], multi: true}, created_at: new Date().toISOString()},
    {id: 'up1', site_id: S1, org_id: me.org_id, name: 'Uploaded RAMS', doc_type: 'RAMS', status: 'current', storage_path: 'x/up.pdf', sign_layout: null, created_at: new Date().toISOString()},
  ];
  db.rams_builds = [{id: 'b1', org_id: me.org_id, site_id: S1, title: 'Roof', status: 'issued', revision: 1, ra_doc_id: 'ra1', ms_doc_id: 'ms1', details: {}, hazards: [], sections: [], ppe: []}];
  db.sign_layout_templates = [];
  await ctx.route(/storage\/v1\/object\/(public\/|sign\/)?rams-docs\//, (r) => (r.request().method() === 'GET' ? r.fulfill({status: 200, contentType: 'application/pdf', body: pdf}) : r.fallback()));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(4500);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/sites/' + S1 + '/hs/rams'); await page.waitForTimeout(4000);
  await page.goto(B + '/sites/' + S1 + '/hs/rams/boxes/ra1'); await page.waitForTimeout(6000);
  const ov = page.getByTestId('sign-overlay').last();
  const drag = async (x0, y0, x1, y1) => { await ov.scrollIntoViewIfNeeded(); const b = await ov.boundingBox(); await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0); await page.mouse.down(); await page.mouse.move(b.x + b.width * (x0 + x1) / 2, b.y + b.height * (y0 + y1) / 2, {steps: 4}); await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, {steps: 4}); await page.mouse.up(); await page.waitForTimeout(300); };

  // Client 1 on the Risk Assessment: signature, name, date.
  await page.getByText(/^Client 1$/).first().click(); await page.waitForTimeout(300);
  await page.getByText(/^Signature( ✓\d*)?$/).first().click(); await page.waitForTimeout(300);
  await drag(0.1, 0.6, 0.4, 0.65);
  await drag(0.45, 0.6, 0.7, 0.65);
  await drag(0.75, 0.6, 0.9, 0.65);
  const raBoxes = () => db.rams_docs.find((x) => x.id === 'ra1').sign_layout.boxes;
  await page.getByText('Save signature boxes', {exact: true}).click(); await page.waitForTimeout(1500);
  let t = await page.locator('body').innerText();
  check(raBoxes().filter((b) => b.w === 'client1').length === 3, 'the RA saved with Client 1\'s three boxes');
  check(/Add the same people to the Method Statement\?/.test(t) && /Client 1/.test(t), 'it asks to add Client 1 to the Method Statement');
  await page.screenshot({path: path.join(SHOTS, 'carry-ask.png')});
  await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(6000);
  check(/\/boxes\/ms1\?from=ra1/.test(page.url()), 'Yes opens the Method Statement\'s boxes');
  t = await page.locator('body').innerText();
  check(/From The Risk Assessment: 1 To Place/.test(t) && /Tap the page where Client 1 signs/.test(t), 'it knows Client 1 is to be placed, and says tap where');
  await page.screenshot({path: path.join(SHOTS, 'carry-place.png')});
  const ob = await ov.boundingBox(); await ov.scrollIntoViewIfNeeded(); const ob2 = await ov.boundingBox();
  await page.mouse.click(ob2.x + ob2.width * 0.2, ob2.y + ob2.height * 0.8); await page.waitForTimeout(600);
  t = await page.locator('body').innerText();
  check(/Everyone From The Risk Assessment Is Placed/.test(t), 'one tap places them');
  await page.screenshot({path: path.join(SHOTS, 'carry-placed.png')});
  await page.getByText('Save signature boxes', {exact: true}).click(); await page.waitForTimeout(2000);
  const ms = db.rams_docs.find((x) => x.id === 'ms1').sign_layout.boxes, cl = ms.filter((b) => b.w === 'client1');
  const minX = Math.min(...cl.map((b) => b.r[0])), minY = Math.min(...cl.map((b) => b.r[1]));
  check(cl.length === 3 && ['sig', 'name', 'date'].every((k) => cl.some((b) => b.t === k)) && Math.abs(minX - 0.2) < 0.02 && Math.abs(minY - 0.8) < 0.02 && ms.filter((b) => b.w === 'op1').length === 1,
    `the MS saved Client 1's signature, name and date where tapped, keeping its own boxes (${minX.toFixed(2)}, ${minY.toFixed(2)})`);
  check(!/\/boxes\//.test(page.url()) && !/Add the same people/.test(await page.locator('body').innerText()), 'saving the MS goes back without asking again');

  // Nobody new → no question.
  await page.goto(B + '/sites/' + S1 + '/hs/rams/boxes/ra1'); await page.waitForTimeout(6000);
  await page.getByText('Save signature boxes', {exact: true}).click(); await page.waitForTimeout(1500);
  check(!/Add the same people/.test(await page.locator('body').innerText()), 'nobody new on the RA: no question');
  // Not made in the builder → no question.
  await page.goto(B + '/sites/' + S1 + '/hs/rams/boxes/up1'); await page.waitForTimeout(6000);
  await page.getByText(/^Client 1$/).first().click(); await page.waitForTimeout(300);
  await page.getByText(/^Signature( ✓\d*)?$/).first().click(); await page.waitForTimeout(300);
  await drag(0.1, 0.6, 0.4, 0.65);
  await page.getByText('Save signature boxes', {exact: true}).click(); await page.waitForTimeout(1500);
  check(!/Add the same people/.test(await page.locator('body').innerText()) && (db.rams_docs.find((x) => x.id === 'up1').sign_layout || {boxes: []}).boxes.length >= 1, 'an uploaded RAMS on its own: saved, no question');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
