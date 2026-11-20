// PM home (Andy, 5 Nov 2026): the sites map opens on where most jobs are (a London group, not the whole
// country). (Its "Pick up where you left off" card went in the Home redesign.) Fake database, real map tiles and postcodes.
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
    // The "Pick up where you left off" card went in the Home redesign; the map is on a computer only.
    const canvas = page.locator('canvas').first();
    if (W >= 1000) {
      check(await canvas.count() > 0, `${W}: the sites map is on Home`);
      if (await canvas.count()) { await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(5000); }
      const m = await canvas.boundingBox();
      const pins = await page.locator('.smpin').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return {t: e.title || '', x: r.x + r.width / 2, y: r.y + r.height / 2}; }));
      const inView = (pc) => pins.some((p) => p.t.includes(pc) && m && p.x >= m.x && p.x <= m.x + m.width && p.y >= m.y && p.y <= m.y + m.height);
      const london = ['EC1A 1BB', 'SW1A 1AA', 'E14 5AB', 'N1 9GU'].filter(inView);
      check(london.length === 4 && !inView('G1 1XQ') && !inView('M1 1AE'), `${W}: the map opens on the London group, not the whole country (London pins in view ${london.length}/4, Glasgow ${inView('G1 1XQ')}, Manchester ${inView('M1 1AE')})`);
    } else {
      check(await canvas.count() === 0, `${W}: no map on a phone (computer only)`);
    }
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `mapfocus-${W}.png`)});
    await ctx.close();
  }
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
