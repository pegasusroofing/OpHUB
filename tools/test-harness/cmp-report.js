// Old app vs new app, side by side, for report screens and their PDFs (4 Nov 2026). Fake database only.
//   node cmp-report.js briefing|reports [width]
// Saves shots/cmp/<name>-old-<w>.png, -new-<w>.png, the fill screens (-old-fill-, -new-fill-) and the PDFs each app
// makes (-old.pdf, -new.pdf).
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const kind = process.argv[2] || 'briefing', W = +(process.argv[3] || 1300);
const OUT = path.join(__dirname, 'shots', 'cmp'); fs.mkdirSync(OUT, {recursive: true});
const rep = (name, n) => ({name, old: `#/site/${S1}/snagging/reports/view/rc${n}`, neu: `/sites/${S1}/snagging/reports/view/rc${n}`, oldFill: `#/site/${S1}/snagging/reports/fill/rf${n}`, newFill: `/sites/${S1}/snagging/reports/fill/rf${n}`, oldPdf: `exportReportPDF('rc${n}')`});
const CASES = {
  briefing: {seed: './seeds/briefcmp', items: [{name: 'briefing', old: `#/site/${S1}/hs/briefings/view/bf1`, neu: `/sites/${S1}/hs/briefings/bf1`, oldFill: `#/site/${S1}/hs/briefings/fill/bf2`, newFill: `/sites/${S1}/hs/briefings/fill/bf2`, oldPdf: "exportDailyBriefingPDF('bf1')"}]},
  reports: {seed: './seeds/rptcmp', items: [rep('prestart', 1), rep('roofcond', 2), rep('handover', 3), rep('loler', 4)]},
};
const c = CASES[kind];
const only = process.argv[4];
const items = c.items.filter((it) => !only || it.name === only);
// Every PDF a page makes goes through a blob URL: keep a copy.
const grab = () => {
  const orig = URL.createObjectURL;
  window.__pdfs = [];
  URL.createObjectURL = function (b) { try { if (b && /pdf/.test(b.type || '')) b.arrayBuffer().then((a) => window.__pdfs.push(Array.from(new Uint8Array(a)))); } catch (e) { /* ignore */ } return orig.call(URL, b); };
};
async function savePdf(page, file, before) {
  for (let i = 0; i < 40; i++) { const n = await page.evaluate(() => (window.__pdfs || []).length); if (n > before) break; await page.waitForTimeout(500); }
  const bytes = await page.evaluate((b) => (window.__pdfs || [])[b] || null, before);
  if (bytes) fs.writeFileSync(file, Buffer.from(bytes));
  return !!bytes;
}
const count = (page) => page.evaluate(() => (window.__pdfs || []).length);
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
    await ctx.route(/pdf-lib.*\.js/, (r) => r.fulfill({status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'), 'utf8')}));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await login(page, port);
    for (const it of items) {
      if (it.oldFill) { await page.evaluate((h) => go(h), it.oldFill); await page.waitForTimeout(3500); await page.screenshot({path: path.join(OUT, `${it.name}-old-fill-${W}.png`), fullPage: true}); }
      await page.evaluate((h) => go(h), it.old); await page.waitForTimeout(3500);
      await page.screenshot({path: path.join(OUT, `${it.name}-old-${W}.png`), fullPage: true});
      // The old app shows its PDFs in its own viewer: take the bytes from there.
      await page.evaluate(() => { try { pdfViewerState = null; } catch (e) { /* none */ } });
      await page.evaluate((js) => eval(js), it.oldPdf).catch((e) => console.log('old export', String(e).slice(0, 80)));
      let bytes = null;
      for (let i = 0; i < 40 && !bytes; i++) { await page.waitForTimeout(500); bytes = await page.evaluate(() => { try { return pdfViewerState && pdfViewerState.bytes ? Array.from(pdfViewerState.bytes) : null; } catch (e) { return null; } }); }
      if (bytes) fs.writeFileSync(path.join(OUT, `${it.name}-old.pdf`), Buffer.from(bytes));
      console.log(it.name, 'old pdf', !!bytes);
      await page.keyboard.press('Escape').catch(() => {});
    }
    console.log('old errors:', errs.slice(0, 3).join(' | '));
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
    for (const it of items) {
      await page.goto('http://localhost:8081' + it.neu); await page.waitForTimeout(4500);
      await page.screenshot({path: path.join(OUT, `${it.name}-new-${W}.png`), fullPage: true});
      const b = await count(page);
      await page.getByText(/^(📄 )?Export( To)? PDF$/).first().click().catch((e) => console.log('new export click', e.message.slice(0, 80)));
      await page.waitForTimeout(800);
      await page.getByText(/^📄 ?PDF$|^PDF$/).first().click({timeout: 1500}).catch(() => {});
      console.log(it.name, 'new pdf', await savePdf(page, path.join(OUT, `${it.name}-new.pdf`), b));
      if (it.newFill) { await page.goto('http://localhost:8081' + it.newFill); await page.waitForTimeout(4500); await page.screenshot({path: path.join(OUT, `${it.name}-new-fill-${W}.png`), fullPage: true}); }
    }
    console.log('new errors:', errs.slice(0, 3).join(' | '));
  }
  await browser.close();
})();
