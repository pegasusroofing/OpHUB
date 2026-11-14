// Andy's laptop list, 14 Nov 2026 (late): Home's words line up inside the tiles; the Company Dashboard in Finance
// Overview's style (figure on top, tinted tiles, Needs Attention cards, no "Tap to open"); the Operative Dashboard's
// Training Matrix exports a footer row, half each, and no Operative Tools list; an operative's page with a clear
// + Add Certificate, no matrix export, OneDrive between Certificates and Tools, and room above Tools and Subcontractor
// Form. node dash14-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1440, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(7000);
  const body = () => page.locator('body').innerText();
  // x of a piece of text (its first match whose own text is exactly that).
  const xOf = (re) => page.evaluate((src) => { const r = new RegExp(src); const d = [...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && r.test(e.innerText) && e.getBoundingClientRect().width > 0); return d ? Math.round(d.getBoundingClientRect().left) : -1; }, re.source);

  // Home: the words in each tile start the same distance in.
  const xs = [await xOf(/^Live projects$/), await xOf(/^Sites map$/), await xOf(/^Today$/)];
  // Each tile is the nearest white box around the words; measured to where the letters start.
  const ins = await page.evaluate(() => [/^Sites map$/, /^Today$/, /^(Mon|Tue|Wed|Thu|Fri) [0-9]+$/].map((re) => { const d = [...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && re.test(e.innerText) && e.getBoundingClientRect().left > 260 && e.getBoundingClientRect().width > 0); if (!d) return -1; let p = d.parentElement; while (p && getComputedStyle(p).backgroundColor !== 'rgb(255, 255, 255)') p = p.parentElement; const rg = document.createRange(); rg.selectNodeContents(d); return p ? Math.round(rg.getBoundingClientRect().left - p.getBoundingClientRect().left) : -1; }));
  check(ins.every((n) => n >= 18 && n <= 20), `Home: Sites map, Today and the Next 5 Days start 18 in from their tile edges (${ins.join(', ')})`);
  const mapX = await page.evaluate(() => { const c = document.querySelector('canvas, .maplibregl-map'); return c ? Math.round(c.getBoundingClientRect().left) : -1; });
  check(Math.abs(mapX - xs[1]) <= 1, `Home: the map lines up with its title (${mapX} / ${xs[1]})`);
  check(!/layers\.borough-name/.test(await body()), 'Home: no map error message');
  await page.screenshot({path: path.join(SHOTS, 'laptop-home-aligned.png')});

  // Company Dashboard.
  await page.goto(B + '/pm/dashboard'); await page.waitForTimeout(5000);
  let t = await body();
  check(!/Tap to open/.test(t), 'Company Dashboard: no "Tap to open" lines');
  check(/Needs Attention/.test(t) && /Live Projects With Open Snags/.test(t), 'Company Dashboard: Needs Attention and the project lists as Finance-style cards');
  const tint = await page.evaluate(() => { const d = [...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && e.innerText === 'Live Contract Value'); return d ? getComputedStyle(d.parentElement).backgroundColor : ''; });
  check(tint === 'rgb(243, 247, 255)', `Company Dashboard: the money tiles are tinted as Finance's (${tint})`);
  const lx = await xOf(/^Live Contract Value$/), vx = await xOf(/^£[\d,]+$/);
  check(lx > 0 && Math.abs(lx - vx) <= 2, 'Company Dashboard: figure and words left-aligned, as Finance');
  await page.screenshot({path: path.join(SHOTS, 'laptop-company-dashboard.png')});
  await page.mouse.move(800, 600); await page.mouse.wheel(0, 1400); await page.waitForTimeout(800);
  await page.screenshot({path: path.join(SHOTS, 'laptop-company-dashboard-2.png')});

  // Operative Dashboard.
  await page.goto(B + '/pm/operatives'); await page.waitForTimeout(5000);
  t = await body();
  check(!/Operative Tools/.test(t), 'Operative Dashboard: no Operative Tools list');
  const bx = await page.getByText('Export Training Matrix (Excel)', {exact: true}).boundingBox();
  const bp = await page.getByText('Export Training Matrix (PDF)', {exact: true}).boundingBox();
  const btn = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Export footer"] > *')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.top), Math.round(r.bottom)]; }));
  check(!!bx && !!bp && Math.abs(bx.y - bp.y) < 2, 'Operative Dashboard: the two exports on one row');
  check(btn.length === 2 && Math.abs(btn[0][1] - btn[1][1]) <= 1, `Operative Dashboard: half each (${btn.map((b) => b[1]).join(' / ')})`);
  check(btn.length === 2 && btn[0][3] >= 880, `Operative Dashboard: a footer at the bottom of the screen (${btn[0] && btn[0][3]})`);
  await page.screenshot({path: path.join(SHOTS, 'laptop-operative-dashboard.png')});

  // One operative.
  const op = db.profiles.find((p) => p.role === 'operative');
  await page.goto(B + '/pm/operatives/' + op.id); await page.waitForTimeout(5000);
  t = await body();
  check(!/Export Full Training Matrix/.test(t), 'Operative page: no Training Matrix export');
  check(await page.getByText('+ Add Certificate', {exact: true}).count() === 1, 'Operative page: a clear + Add Certificate button');
  const y = async (s) => ((await page.getByText(s, {exact: true}).first().boundingBox()) || {y: -1}).y;
  const [yc, yo, yt, ys] = [await y('Certificates'), await y('OneDrive Sync'), await y('Tools'), await y('Subcontractor Form')];
  check(yc > 0 && yc < yo && yo < yt && yt < ys, `Operative page: Certificates, then OneDrive, then Tools, then Subcontractor Form (${[yc, yo, yt, ys].map(Math.round).join(' < ')})`);
  const addTool = await page.getByText('+ Add Tool', {exact: true}).first().boundingBox();
  const sub = await page.getByText('Subcontractor Form', {exact: true}).first().boundingBox();
  check(!!addTool && !!sub && sub.y - (addTool.y + addTool.height) >= 20, `Operative page: room above Subcontractor Form (${addTool && sub ? Math.round(sub.y - addTool.y - addTool.height) : '?'}px)`);
  await page.getByText('+ Add Certificate', {exact: true}).click(); await page.waitForTimeout(800);
  check(/Expiry date|Choose file/.test(await body()) && await page.getByText('✕ Close', {exact: true}).count() === 1, 'Operative page: + Add Certificate opens the form, with ✕ Close');
  await page.getByText('✕ Close', {exact: true}).click(); await page.waitForTimeout(500);
  await page.screenshot({path: path.join(SHOTS, 'laptop-operative-page.png'), fullPage: true});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
