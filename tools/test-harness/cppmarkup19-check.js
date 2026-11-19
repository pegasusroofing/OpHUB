// CPP site plan mark-up (Andy, 19 Nov 2026: "the mark up needs to be able to add a line and a hash (free draw that then
// hashes and has the option to default the drawn lines to straigh lines please) also make the option to make lines
// bigger (the biggest currently isnt big enough"). On a site layout plan: Line, Hatch, Straight Lines (on to start
// with), sizes up to XXL; a line, a hatched area and a hand-drawn pen line are drawn and saved.
// Fake database. node cppmarkup19-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'cppmarkup19');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const SAMPLE = path.join(__dirname, 'shots', 'samples', 'site-photo.jpg');

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, dev] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    Object.assign(db.sites.find((s) => s.id === S1), {acting_as_main_contractor: true, postcode: 'SW4 6RZ', geofence_lat: 51.4613, geofence_lon: -0.1376});
    db.cpp_plans = []; db.cpp_defaults = []; db.mc_documents = [];
    await ctx.route(/nominatim\.openstreetmap\.org|overpass-api\.de|api\.postcodes\.io/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: '[]'}));
    const pics = [];
    await ctx.route(/storage\/v1\/object\/mc-documents\/.*cpp-images\//, (r) => { if (r.request().method() === 'POST') { pics.push(r.request().url()); return r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({Key: 'mc-documents/i.jpg', Id: 'i'})}); } r.fallback(); });
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    const text = () => page.evaluate(() => document.body.innerText);
    await page.goto(`${B}/sites/${S1}/mc/docs/cpp`); await page.waitForTimeout(4500);
    await page.getByText('+ Build A New Plan', {exact: true}).click(); await page.waitForTimeout(6000);
    if (!db.cpp_plans[0]) { check(false, `${dev}: a plan is made`); await ctx.close(); continue; }
    // A picture for the site layout plan, then the mark-up.
    await page.getByText('Add Plan', {exact: true}).first().click(); await page.waitForTimeout(800);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📷 A Photo Or Picture', {exact: true}).click()]);
    await fc.setFiles(SAMPLE); await page.waitForTimeout(4000);
    const t = await text();
    check(/╱ Line/.test(t) && /▨ Hatch/.test(t) && /📏 Straight Lines: On/.test(t), `${dev}: the plan mark-up has Line, Hatch and Straight Lines (on to start with)`);
    check(/\bXL\b/.test(t) && /\bXXL\b/.test(t), `${dev}: line sizes go up to XL and XXL`);
    if (dev === 'phone') { await page.screenshot({path: path.join(SHOTS, 'phone-markup.png')}); await ctx.close(); continue; }
    const area = await page.evaluate(() => { const s = [...document.querySelectorAll('svg')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 300).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return s ? {x: s.left, y: s.top, w: s.width, h: s.height} : null; });
    const at = (fx, fy) => [area.x + area.w * fx, area.y + area.h * fy];
    const draw = async (pts) => { await page.mouse.move(...at(...pts[0])); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...at(...p), {steps: 3}); await page.mouse.up(); await page.waitForTimeout(400); };
    // A line at size L.
    await page.getByText('L', {exact: true}).click();
    await page.getByText('╱ Line', {exact: true}).click();
    await draw([[0.08, 0.15], [0.3, 0.18], [0.5, 0.12]]);
    // A hatched area at XXL, drawn roughly round and back to the start.
    await page.getByText('XXL', {exact: true}).click();
    await page.getByText('▨ Hatch', {exact: true}).click();
    const rough = [];
    for (let i = 0; i <= 8; i++) rough.push([0.2 + i * 0.04, 0.35 + (i % 2) * 0.006]);
    for (let i = 1; i <= 8; i++) rough.push([0.52 + (i % 2) * 0.004, 0.35 + i * 0.04]);
    for (let i = 1; i <= 8; i++) rough.push([0.52 - i * 0.04, 0.67 - (i % 2) * 0.006]);
    for (let i = 1; i <= 8; i++) rough.push([0.2 + (i % 2) * 0.004, 0.67 - i * 0.04]);
    await draw(rough);
    // A hand-drawn pen line, a bit wobbly: made straight.
    await page.getByText('✎ Pen', {exact: true}).click();
    const wob = []; for (let i = 0; i <= 12; i++) wob.push([0.62 + i * 0.025, 0.5 + (i % 2) * 0.004]);
    await draw(wob);
    await page.screenshot({path: path.join(SHOTS, 'laptop-markup.png')});
    await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(4500);
    const ops = (db.cpp_plans[0].data.sitePlanMarks || {}).ops || [];
    const [line, hatch, pen] = ops;
    check(ops.length === 3, `laptop: three marks saved (${ops.map((o) => o.t).join(', ')})`);
    check(line && line.t === 'pen' && line.pts.length === 2, `laptop: the line is a straight line (${line && line.pts.length} points)`);
    check(hatch && hatch.t === 'hatch' && hatch.pts.length >= 4 && hatch.pts.length <= 6, `laptop: the hatched area is kept with straight edges (${hatch && hatch.pts.length} corners)`);
    check(pen && pen.t === 'pen' && pen.pts.length === 2, `laptop: the wobbly pen line is made straight (${pen && pen.pts.length} points)`);
    check(hatch && line && hatch.w >= line.w * 2, `laptop: XXL is much thicker than L (${hatch && hatch.w} vs ${line && line.w})`);
    check(!!db.cpp_plans[0].data.sitePlan && pics.length >= 2, `laptop: the marked-up plan is saved (${pics.length} pictures)`);
    // The saved picture, as the PDF gets it.
    const shown = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.src).find((s) => /^data:image|blob:/.test(s)) || null);
    if (shown) { const b64 = shown.split(',')[1]; if (b64) fs.writeFileSync(path.join(SHOTS, 'laptop-saved.jpg'), Buffer.from(b64, 'base64')); }
    await page.screenshot({path: path.join(SHOTS, 'laptop-after-save.png')});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
