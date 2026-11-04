// Old app vs new app, side by side, for one report screen and its PDF (4 Nov 2026). Fake database only.
//   node cmp-report.js briefing [width]
// Saves shots/cmp/<name>-old-<w>.png, -new-<w>.png and the PDFs each app makes (-old.pdf, -new.pdf).
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const kind = process.argv[2] || 'briefing', W = +(process.argv[3] || 1300);
const OUT = path.join(__dirname, 'shots', 'cmp'); fs.mkdirSync(OUT, {recursive: true});
const CASES = {
  briefing: {seed: './seeds/briefcmp', old: `#/site/${S1}/hs/briefings/view/bf1`, neu: `/sites/${S1}/hs/briefings/bf1`, oldFill: `#/site/${S1}/hs/briefings/fill/bf2`, newFill: `/sites/${S1}/hs/briefings/fill/bf2`, pdfOld: 'Export PDF', pdfNew: /^(📄 )?Export( To)? PDF$/},
};
const c = CASES[kind];
// Every PDF a page makes goes through a blob URL: keep a copy.
const grab = () => {
  const orig = URL.createObjectURL;
  window.__pdfs = [];
  URL.createObjectURL = function (b) { try { if (b && /pdf/.test(b.type || '')) b.arrayBuffer().then((a) => window.__pdfs.push(Array.from(new Uint8Array(a)))); } catch (e) { /* ignore */ } return orig.call(URL, b); };
};
async function savePdf(page, file) {
  for (let i = 0; i < 30; i++) { const n = await page.evaluate(() => (window.__pdfs || []).length); if (n) break; await page.waitForTimeout(500); }
  const bytes = await page.evaluate(() => (window.__pdfs || []).slice(-1)[0] || null);
  if (bytes) fs.writeFileSync(file, Buffer.from(bytes));
  return !!bytes;
}
(async () => {
  const browser = await chromium.launch();
  const opt = {viewport: {width: W, height: W < 500 ? 844 : 1000}};
  // Old app (app.html)
  {
    const {srv, port} = await serve();
    const {ctx, db} = await makeContext(browser, 'admin', [], opt);
    require('./fresh/seed')(db); db.profiles[0].howto_dismissed = ['*']; db.profiles[0].signature_path = 'sig/me.png';
    require(c.seed)(db, S1);
    await ctx.addInitScript(grab);
    for (const lib of ['pdf-lib']) await ctx.route(new RegExp(lib + '.*\\.js'), (r) => r.fulfill({status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'), 'utf8')}));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await login(page, port);
    if (c.oldFill) { await page.evaluate((h) => go(h), c.oldFill); await page.waitForTimeout(3500); await page.screenshot({path: path.join(OUT, `${kind}-old-fill-${W}.png`), fullPage: true}); }
    await page.evaluate((h) => go(h), c.old); await page.waitForTimeout(3500);
    await page.screenshot({path: path.join(OUT, `${kind}-old-${W}.png`), fullPage: true});
    await page.evaluate((id) => exportDailyBriefingPDF(id), 'bf1').catch((e) => console.log('old export', String(e).slice(0, 80)));
    console.log('old pdf', await savePdf(page, path.join(OUT, `${kind}-old.pdf`)), errs.slice(0, 3).join(' | '));
    await ctx.close(); srv.close();
  }
  // New app (Expo dev server)
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], opt);
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*']; me.signature_path = 'sig/me.png';
    require(c.seed)(db, S1);
    await ctx.addInitScript(grab);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto('http://localhost:8081' + c.neu); await page.waitForTimeout(4500);
    await page.screenshot({path: path.join(OUT, `${kind}-new-${W}.png`), fullPage: true});
    await page.getByText(c.pdfNew).first().click().catch((e) => console.log('new export click', e.message.slice(0, 80)));
    await page.waitForTimeout(800);
    // Export may ask how (PDF / Excel): take the PDF.
    await page.getByText(/^📄 ?PDF$|^PDF$/).first().click({timeout: 1500}).catch(() => {});
    console.log('new pdf', await savePdf(page, path.join(OUT, `${kind}-new.pdf`)), errs.slice(0, 3).join(' | '));
    if (c.newFill) { await page.goto('http://localhost:8081' + c.newFill); await page.waitForTimeout(4500); await page.screenshot({path: path.join(OUT, `${kind}-new-fill-${W}.png`), fullPage: true}); }
  }
  await browser.close();
})();
