// The PDF code loads when it's needed (speed review, 15 Nov 2026): on the production web build, the start-up files
// have no pdf-lib; opening a screen doesn't fetch it; pressing Export To PDF fetches it once and the PDF comes out; and
// it also loads by itself 8 seconds after the app opens (so Export works if the signal drops later).
//   APPDIR=<npx expo export --platform web --output-dir <dir>> node pdflazy-check.js
const {chromium, makeContext} = require('./harness');
const http = require('http'), fs = require('fs'), path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const DIR = path.resolve(process.env.APPDIR || '');
if (!process.env.APPDIR || !fs.existsSync(path.join(DIR, 'index.html'))) { console.log('Set APPDIR to a production export.'); process.exit(1); }
const srv = http.createServer((q, r) => {
  let f = path.join(DIR, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIR, 'index.html');
  r.writeHead(200, {'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'}); r.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((res) => srv.listen(0, res)); const B = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', null, {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const js = []; const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('request', (r) => { if (/\.js(\?|$)/.test(r.url())) js.push(path.basename(new URL(r.url()).pathname)); });
  const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const startFiles = [...idx.matchAll(/src="([^"]+\.js)"/g)].map((m) => path.join(DIR, m[1]));
  check(startFiles.length > 0 && startFiles.every((f) => !/Helvetica-Bold/.test(fs.readFileSync(f, 'utf8'))), `no pdf-lib in the ${startFiles.length} start-up files`);
  await page.goto(B + '/login'); await page.waitForSelector('input[placeholder="you@yourcompany.co.uk"]', {timeout: 60000});
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForURL(/\/home/, {timeout: 60000});
  await page.goto(B + '/fin/purchases?tab=invoices&f=all'); await page.getByText('SIG-88231').first().waitFor({timeout: 60000});
  check(!js.some((f) => f.startsWith('pdfKit')), 'opening Purchases does not fetch the PDF code');
  const t0 = Date.now();
  await page.getByText('Export To PDF', {exact: true}).first().click();
  await page.getByText('📄 PDF').first().waitFor({timeout: 30000});
  check(js.filter((f) => f.startsWith('pdfKit')).length === 1, `Export To PDF fetched the PDF code once and offered the PDF (${Date.now() - t0} ms)`);
  const dl = page.waitForEvent('download', {timeout: 30000});
  await page.getByText('📄 PDF').first().click();
  const d = await dl; const p = await d.path(); const bytes = fs.readFileSync(p);
  check(bytes.slice(0, 5).toString() === '%PDF-' && bytes.length > 1000, `the PDF came out (${d.suggestedFilename()}, ${bytes.length} bytes)`);
  // A fresh start: the PDF code arrives by itself after about 8 seconds.
  const page2 = await ctx.newPage(); const js2 = []; page2.on('request', (r) => { if (/pdfKit.*\.js/.test(r.url())) js2.push(Date.now()); }); page2.on('pageerror', (e) => errs.push(e.message));
  const t1 = Date.now(); await page2.goto(B + '/sites'); await page2.waitForTimeout(12000);
  check(js2.length === 1 && js2[0] - t1 > 6000, `the PDF code loads by itself after the screen is up (${js2.length ? Math.round((js2[0] - t1) / 1000) + ' s' : 'not fetched'})`);
  console.log('errors:', errs.length ? errs.slice(0, 3) : 'none'); if (errs.length) process.exitCode = 1;
  await browser.close(); srv.close();
})();
