// Checks the offline demo with no internet (Andy, 9 Nov 2026). Laptop: served by offline/serve.js with every request to
// anywhere but this laptop blocked. Phone: opened once, then the network cut off altogether and the page reloaded - it
// must come from what the phone kept (the service worker). Both: sign in, the home, a repair job, Finance; nothing ever
// sent to Supabase. Run offline/serve.js first, then: node tools/offline/offline-check.js
const path = require('path');
const {chromium} = require(path.join(__dirname, '..', 'test-harness', 'node_modules', 'playwright'));
const B = 'http://localhost:8099', S4 = '44444444-4444-4444-4444-444444444444';
const SHOTS = path.join(__dirname, '..', 'test-harness', 'shots');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const signIn = async (page, email) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', email); await page.fill('input[type="password"]', 'anything');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
(async () => {
  const browser = await chromium.launch();
  // ---- Laptop: nothing but this laptop ----
  {
    const ctx = await browser.newContext({viewport: {width: 1366, height: 900}});
    const outside = [], errs = [];
    await ctx.route((u) => !/^http:\/\/localhost:8099\//.test(u.href), (r) => { outside.push(r.request().url()); return r.abort(); });
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    // The first visit sets the demo up on the laptop (as Andy's first double-click does); from then on nothing leaves it.
    await page.goto(B + '/'); await page.waitForTimeout(3000);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; await new Promise((ok) => setTimeout(ok, 3000)); });
    outside.length = 0;
    await signIn(page, 'andy@demo.co.uk');
    let t = await page.locator('body').innerText();
    check(/Andy Admin|Live projects/i.test(t), 'laptop: signed in as Andy Admin with no internet');
    await page.screenshot({path: path.join(SHOTS, 'offline-laptop-home.png')});
    await page.goto(`${B}/sites/${S4}`); await page.waitForTimeout(5000);
    check(/Works Orders/.test(await page.locator('body').innerText()), 'laptop: the repair contract home');
    await page.goto(`${B}/sites/${S4}/repairs/job/dj3`); await page.waitForTimeout(5000);
    t = await page.locator('body').innerText();
    check(/WO-1003/.test(t) && /WORK SUMMARY/.test(t), 'laptop: a repair job, with its Work Summary');
    await page.getByLabel('Add a note').fill('Tried on the plane'); await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(1500);
    await page.reload(); await page.waitForTimeout(6000);
    check(/Tried on the plane/.test(await page.locator('body').innerText()), 'laptop: a note added offline is still there after a reload');
    await page.screenshot({path: path.join(SHOTS, 'offline-laptop-job.png')});
    await page.goto(`${B}/fin`); await page.waitForTimeout(5000);
    check(/Finance|Jobs/i.test(await page.locator('body').innerText()), 'laptop: Finance opens');
    const toSb = [...new Set(outside.filter((u) => /supabase\.co/.test(u)).map((u) => u.split('?')[0]))];
    check(!toSb.length, `laptop: nothing sent to Supabase (${toSb.length})${toSb.length ? '\n  ' + toSb.slice(0, 8).join('\n  ') : ''}`);
    check(!errs.length, `laptop: no page errors ${errs.slice(0, 2).join(' | ')}`);
    await ctx.close();
  }
  // ---- Phone: opened once, then no signal at all ----
  {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
    const sent = [];
    ctx.on('request', (r) => { if (/supabase\.co/.test(r.url())) sent.push(r.url()); });
    const page = await ctx.newPage();
    await page.goto(B + '/'); await page.waitForTimeout(6000);
    const kept = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; await new Promise((ok) => setTimeout(ok, 4000)); const ks = await caches.keys(); const c = ks.length ? await caches.open(ks[0]) : null; return {active: !!r.active, files: c ? (await c.keys()).length : 0}; });
    check(kept.active && kept.files > 100, `phone: the app saved itself (${kept.files} files kept)`);
    await ctx.setOffline(true);
    await signIn(page, 'jake@demo.co.uk');
    const t = await page.locator('body').innerText();
    check(/Jake|Your day|My Jobs|Check In/i.test(t), 'phone: with no signal, signs in as Jake (an operative)');
    await page.screenshot({path: path.join(SHOTS, 'offline-phone-operative.png')});
    await page.goto(`${B}/sites/${S4}/repairs`); await page.waitForTimeout(6000);
    check(/WO-100/.test(await page.locator('body').innerText()), 'phone: his repair jobs, offline');
    await page.screenshot({path: path.join(SHOTS, 'offline-phone-repairs.png')});
    check(!sent.length, `phone: nothing sent to Supabase (${sent.length})`);
    await ctx.close();
  }
  await browser.close();
})();
