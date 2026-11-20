// Project settings (Andy, 20 Nov 2026): "move the main contractor and multi site maintenance repair under one row for site type
// please? then the options are selectable and the price in here too (change to subcontractor on a price?)" and "make the one
// drive sync folder a drop down folder closed by default". Fake database. node sitetype20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'sitetype20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, tag] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    const site = db.sites.find((s) => s.id === S1);
    Object.assign(site, {acting_as_main_contractor: false, multi_site: false, repair_contract: true, price_enabled: false, onedrive_folder_id: 'f1', onedrive_folder_name: '2602 81 Redington Road'});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/sites/' + S1 + '/admin'); await page.waitForTimeout(5000);
    await page.getByText(/^⚙ Site Set Up/).first().click(); await page.waitForTimeout(600);
    let t = await text();
    check(/Site Type — Repair Contract/.test(t), `${tag}: one Site Type row, saying what it is`);
    check(!/^Main Contractor$/m.test(await page.locator('body').innerText()) && !/Manual Sync/.test(t) && /OneDrive Sync Folder — 📁 2602 81 Redington Road/.test(t), `${tag}: the OneDrive folder is a drop-down, closed to start`);
    await page.getByText(/^Site Type/).first().click(); await page.waitForTimeout(600);
    t = await text();
    check(['Main Contractor', 'Multi-Site', 'Maintenance / Repair Contract', 'Subcontractor On A Price'].every((l) => t.includes(l)) && !/^Price$/m.test(await page.locator('body').innerText()), `${tag}: Main Contractor, Multi-Site, Repair Contract and Subcontractor On A Price in it; no separate Price row`);
    const tick = (l) => page.getByRole('checkbox', {name: l}).first();
    await tick('Main Contractor').click(); await page.waitForTimeout(1200);
    check(site.acting_as_main_contractor === true, `${tag}: Main Contractor ticks on`);
    await tick('Subcontractor On A Price').click(); await page.waitForTimeout(1200);
    check(site.price_enabled === true, `${tag}: Subcontractor On A Price ticks on (the Price tile)`);
    // Multi-site while it's a repair contract: asks, then swaps.
    await tick('Multi-Site').click(); await page.waitForTimeout(700);
    check(/multi-site or a repair contract, not both/.test(await text()), `${tag}: Multi-Site on a repair contract asks first`);
    await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(1500);
    check(site.multi_site === true && site.repair_contract === false, `${tag}: and swaps it to multi-site (${site.multi_site}/${site.repair_contract})`);
    t = await text();
    check(/Site Type — Main Contractor · Multi-Site · On A Price/.test(t) && /Addresses/i.test(t), `${tag}: the row says the new type, and the addresses show`);
    await page.screenshot({path: path.join(SHOTS, `site-type-${tag}.png`), fullPage: true});
    await page.getByText(/OneDrive Sync Folder/).first().click(); await page.waitForTimeout(600);
    check(/Manual Sync/.test(await text()), `${tag}: the OneDrive folder opens`);
    await page.screenshot({path: path.join(SHOTS, `onedrive-open-${tag}.png`), fullPage: true});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
