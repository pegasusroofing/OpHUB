// PM home (Andy, 5 Nov 2026): the sites map opens on where most jobs are (a London group, not the whole
// country), and the "Pick up where you left off" card lines up with the tiles. Fake database, real map tiles and postcodes.
// node mapfocus-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
// Five London-area jobs, one in Manchester and one in Glasgow.
const PCS = ['EC1A 1BB', 'SW1A 1AA', 'E14 5AB', 'N1 9GU', 'CM1 1HT', 'M1 1AE', 'G1 1XQ'];
(async () => {
  const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}); const errs = [];
  for (const [W, H] of [[390, 844], [1300, 1000]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: H}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
    const base = db.sites[0];
    PCS.forEach((pc, i) => db.sites.push({...base, id: 'mf' + i, name: 'ZZ Map ' + pc, postcode: pc, address: '', status: 'active', start_date: null}));
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/home'); await page.waitForTimeout(10000);
    const tile = await page.getByRole('button', {name: /Deliveries/}).first().boundingBox();
    const card = await page.getByText('Daily report', {exact: true}).first().locator('xpath=ancestor::*[@tabindex][1]').boundingBox();
    const tiles = await page.getByRole('button', {name: /Admin/}).first().boundingBox();
    const L = Math.min(tile.x, tiles.x), R = Math.max(tile.x + tile.width, tiles.x + tiles.width);
    check(card && Math.abs(card.x - L) < 1.5 && Math.abs(card.x + card.width - R) < 1.5, `${W}: card edges ${card && Math.round(card.x)}–${card && Math.round(card.x + card.width)} match the tiles ${Math.round(L)}–${Math.round(R)}`);
    const canvas = page.locator('canvas').first(); if (await canvas.count()) { await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(5000); }
    console.log(W, 'pins', await page.locator('.smpin').evaluateAll((els) => els.map((e) => e.title + ' ' + Math.round(e.getBoundingClientRect().x) + ',' + Math.round(e.getBoundingClientRect().y)).join(' | ')));
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `mapfocus-${W}.png`)});
    await ctx.close();
  }
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
