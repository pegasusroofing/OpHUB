// The offline demo picks up a new version (Andy, 17 Nov 2026: "its nothing like the new beta. make the offline like the
// beta so i can review on flight"; his phone kept showing what it saved on day one). On a phone-sized page: once it has
// saved itself, a changed page is shown on the next open with signal (not the kept copy), the kept copy is updated so
// the change is there with no signal too, and demo data kept from an older demo starts again from the new one.
// Run offline/serve.js first, then: node tools/offline/update-check.js
const path = require('path');
const fs = require('fs');
const {chromium} = require(path.join(__dirname, '..', 'test-harness', 'node_modules', 'playwright'));
const B = 'http://localhost:8099', IDX = path.join(__dirname, '..', '..', 'offline', 'app', 'index.html');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const before = fs.readFileSync(IDX, 'utf8');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
    const page = await ctx.newPage();
    // Day one: the phone saves the demo, and some demo data from an older demo is on it.
    await page.goto(B + '/'); await page.waitForTimeout(3000);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; await new Promise((ok) => setTimeout(ok, 4000)); });
    await page.evaluate(() => { localStorage.setItem('ophub-offline-db-v', 'an-older-demo'); localStorage.setItem('ophub-offline-db', JSON.stringify({profiles: [], sites: []})); });
    // A new version goes up.
    fs.writeFileSync(IDX, before.replace(/<head>/i, '<head><meta name="ophub-update-check" content="new">'));
    await page.reload(); await page.waitForTimeout(5000);
    check(await page.locator('meta[name="ophub-update-check"]').count() === 1, 'with signal, the new version shows straight away (not the kept copy)');
    const v = await page.evaluate(() => ({kept: localStorage.getItem('ophub-offline-db-v'), want: window.__OPHUB_DEMO_V, sites: (window.__ophubOffline && window.__ophubOffline.db.sites || []).length}));
    check(v.kept === v.want && v.sites > 0, `demo data from an older demo starts again from the new one (${JSON.stringify(v)})`);
    // No signal: the kept copy has the new version too.
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(5000);
    check(await page.locator('meta[name="ophub-update-check"]').count() === 1 && /Sign In|OpHUB/i.test(await page.locator('body').innerText()), 'with no signal it still opens, the new version kept');
    await ctx.setOffline(false);
  } finally {
    fs.writeFileSync(IDX, before);
    await browser.close();
  }
})();
