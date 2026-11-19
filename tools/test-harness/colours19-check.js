// Company colours by clicking (Andy, 19 Nov 2026: "i want to be able to click to choose and then click on the uploaded
// logo to choose the two colours"): Admin > Company Logo & Theme finds the logo's colours, a click on the logo takes the
// colour under the pointer for the colour being set, the palette works, and Save Theme keeps both. Fake database; the
// logo is the plain made-up one (blue roof, dark "YOUR", blue "COMPANY"). node colours19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {logo_path: `${db.organizations[0].id}/logo.png`, color_primary: '#E3262B', color_secondary: '#101114'});
  const LOGO = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'website', 'demo-logo.png'));
  await ctx.route(/org-logos/, (r) => r.fulfill({status: 200, contentType: 'image/png', headers: {'Access-Control-Allow-Origin': '*'}, body: LOGO}));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(`${B}/pm/admin/branding`); await page.waitForTimeout(5000);
  const t = await page.evaluate(() => document.body.innerText);
  check(/Primary Colour/.test(t) && /Secondary Colour/.test(t) && /Or Choose A Colour/.test(t), 'the theme has Primary / Secondary to pick, and a palette');
  await page.getByText('Colours In Your Logo', {exact: true}).waitFor({timeout: 10000}).catch(() => {});
  const found = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Use #"]')].map((e) => e.getAttribute('aria-label').slice(4)));
  check(/Colours In Your Logo/.test(await page.evaluate(() => document.body.innerText)) && found.length >= 2, `the logo's colours are found (${found.slice(0, 4).join(', ')} …)`);
  // Where on the logo is clearly blue, and clearly dark (found from the logo itself, so the clicks land on them).
  const spots = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let blue = null, dark = null;
    for (let y = 0; y < c.height && (!blue || !dark); y += 2) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], bb = d[i + 2];
      const near = (dx, dy) => { const j = ((y + dy) * c.width + (x + dx)) * 4; return [d[j], d[j + 1], d[j + 2]]; };
      const solid = (test) => [[-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => test(...near(dx, dy)));
      if (!blue && bb > 150 && bb > r + 60 && solid((R, G, Bl) => Bl > 150 && Bl > R + 60)) blue = {x, y};
      if (!dark && r < 50 && gg < 50 && bb < 60 && solid((R, G, Bl) => R < 50 && G < 50 && Bl < 60)) dark = {x, y};
    }
    return {w: c.width, h: c.height, blue, dark};
  }, require('fs').readFileSync(path.join(__dirname, '..', '..', 'docs', 'website', 'demo-logo.png')).toString('base64'));
  const box = await page.getByLabel('Click the logo to take a colour').boundingBox();
  const at = (p) => { const k = Math.min(220 / spots.w, 220 / spots.h), ox = (220 - spots.w * k) / 2, oy = (220 - spots.h * k) / 2; return [box.x + ox + (p.x + 0.5) * k, box.y + oy + (p.y + 0.5) * k]; };
  await page.mouse.click(...at(spots.blue)); await page.waitForTimeout(500);
  const vals = async () => page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).filter((v) => /^#/.test(v)));
  let v = await vals();
  const isBlue = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return b > 140 && b > r + 40; };
  check(v.length && isBlue(v[0]), `a click on the logo's blue sets the primary colour (${v[0]})`);
  // Secondary: click the dark lettering.
  await page.getByText('Secondary Colour', {exact: true}).click(); await page.waitForTimeout(300);
  await page.mouse.click(...at(spots.dark)); await page.waitForTimeout(500);
  v = await vals();
  const dark = (hex) => parseInt(hex.slice(1, 3), 16) < 90 && parseInt(hex.slice(3, 5), 16) < 90;
  check(v.length && dark(v[0]), `a click on the logo's dark lettering sets the secondary colour (${v[0]})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'colours19.png'), fullPage: true});
  // The palette, then Save Theme.
  await page.getByText('Primary Colour', {exact: true}).click(); await page.waitForTimeout(200);
  await page.getByLabel('Use #2E7D32').click(); await page.waitForTimeout(300);
  await page.getByText('Save Theme', {exact: true}).click(); await page.waitForTimeout(2000);
  const o = db.organizations[0];
  check(o.color_primary === '#2E7D32' && dark(o.color_secondary || '#FFFFFF'), `Save Theme keeps both (${o.color_primary} / ${o.color_secondary})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
