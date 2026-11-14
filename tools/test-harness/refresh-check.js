// Home's header and refresh (Andy, 14 Nov 2026: "Does the refresh button top right work" / "Or design as per old app" /
// "can you make the company name a link to refresh, then company logo top right?"): the header as the old app (the
// company name, a short line, then "OpHUB" in dark bold); tapping the company name refreshes (it fades while it works,
// new data shows) and on the web link reloads the page when a newer version has gone live, but not when it hasn't; the
// company logo sits top right, with no refresh button. Touch phone, fake database. node refresh-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['home', 'guide:closed'];
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true, logo_path: `${db.organizations[0].id}/logo.png`});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  const name = page.locator('[aria-label$=": refresh"] >> visible=true').first();
  check(await name.count() === 1 && /Roofing|Ltd|\w/.test(await name.innerText()), `home: the company name is the refresh (${await name.innerText().catch(() => '')})`);
  check(await page.locator('[aria-label="Refresh"] >> visible=true').count() === 0, 'no separate refresh button');
  const logo = page.locator('[aria-label$=" logo"] >> visible=true').first();
  const lb = await logo.boundingBox();
  check(await logo.count() === 1 && await logo.locator('img').count() === 1, 'the company logo is there');
  check(!!lb && lb.x > 300 && lb.y < 80, `top right (${lb && Math.round(lb.x)}, ${lb && Math.round(lb.y)}, ${lb && Math.round(lb.width)}px)`);
  const bar = await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find((x) => x.childElementCount === 0 && x.innerText === 'OpHUB'); return el ? {font: getComputedStyle(el).fontFamily, weight: getComputedStyle(el).fontWeight, colour: getComputedStyle(el).color} : null; });
  check(!!bar && /Sora/.test(bar.font) && bar.weight === '800' && bar.colour === 'rgb(30, 33, 36)', `header: "OpHUB" in dark bold Sora, not grey capitals (${JSON.stringify(bar)})`);
  check(!/OPHUB/.test((await page.locator('body').innerText()).slice(0, 60)), 'no "OPHUB" in capitals');
  const nb = await name.boundingBox();
  check(!!nb && Math.abs(nb.x + nb.width / 2 - 195) < 8, `the name stays in the middle (${nb && Math.round(nb.x + nb.width / 2)})`);
  await page.screenshot({path: path.join(SHOTS, 'home-refresh.png'), clip: {x: 0, y: 0, width: 390, height: 130}});

  // New data appears after a tap: a new live project.
  const before = await page.locator('body').innerText();
  const live0 = (before.match(/(\d+)\nLive projects/) || [])[1];
  const s = JSON.parse(JSON.stringify(db.sites[0])); s.id = '99999999-9999-9999-9999-999999999999'; s.name = 'Refresh Test House'; s.job_number = 'RTB-999'; db.sites.push(s);
  let calls = 0; page.on('request', (r) => { if (/supabase\.co\/rest/.test(r.url())) calls++; });
  await page.evaluate(() => { window.__stillHere = 1; });
  await name.click(); await page.waitForTimeout(150);
  const faded = await name.evaluate((el) => { let e = el; while (e && e.parentElement) { if (Number(getComputedStyle(e).opacity) < 1) return true; e = e.parentElement; } return false; });
  check(faded, 'the name fades while it works');
  await page.waitForTimeout(2000);
  const after = await page.locator('body').innerText();
  const live1 = (after.match(/(\d+)\nLive projects/) || [])[1];
  check(calls > 3, `it fetches the screen again (${calls} requests)`);
  check(!!live0 && Number(live1) === Number(live0) + 1, `new data shows: Live projects ${live0} → ${live1}`);
  check(await name.evaluate((el) => { let e = el; while (e && e.parentElement) { if (Number(getComputedStyle(e).opacity) < 1) return false; e = e.parentElement; } return true; }), 'and the name comes back to full');
  check(await page.evaluate(() => window.__stillHere === 1), 'no newer version (dev server): the page is not reloaded');

  // On the web link with a newer version live, it reloads the page.
  await page.evaluate(() => { const m = document.createElement('meta'); m.name = 'ophub-build'; m.content = 'old'; document.head.appendChild(m); });
  await page.route('**/version.json*', (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({build: 'old'})}));
  await name.click(); await page.waitForTimeout(2500);
  check(await page.evaluate(() => window.__stillHere === 1), 'same version live: the page is not reloaded');
  await page.unroute('**/version.json*');
  await page.route('**/version.json*', (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({build: 'new'})}));
  await name.click(); await page.waitForTimeout(6000);
  check(await page.evaluate(() => window.__stillHere === undefined), 'a newer version live: the page reloads to get it');
  check(await page.locator('[aria-label$=": refresh"] >> visible=true').count() === 1, 'and comes back on Home');

  // A company with no logo yet gets the OpHUB icon there (a PM: an admin is sent to Set Up Your Company first).
  db.organizations[0].logo_path = null; me.role = 'pm';
  await page.reload(); await page.waitForTimeout(6000);
  check(await page.locator('[aria-label$=" logo"] >> visible=true').first().locator('img').count() === 1, 'no logo yet: the OpHUB icon instead');
  await page.screenshot({path: path.join(SHOTS, 'home-logo.png'), clip: {x: 0, y: 0, width: 390, height: 130}});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
