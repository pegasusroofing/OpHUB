// Speed check (15 Nov 2026, section 4 of docs/claude-code/REVIEW-2026-11-15.md). A busy company (seeds/big.js: 120
// jobs, 3,000 sales invoices…) on a site-like signal: every database request waits DELAY ms (150 by default) and the
// app's own files come down at MBPS megabits a second (4 by default). Signed in as an admin who uses Finance, on a
// laptop. For each screen, opened cold: the requests it makes, the data that comes back, the JavaScript downloaded
// (compressed) and the time until it's usable (its words are on screen and its last request has answered). Then how
// long ticking a to-do takes to show.
//   APPDIR=<a production export: npx expo export --platform web --output-dir <dir>>  OUT=before  node speed-check.js
// Without APPDIR it uses the dev server on 8081 (BASE), whose files aren't compressed or minified.
const {chromium, makeContext} = require('./harness');
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const DELAY = +(process.env.DELAY || 150), MBPS = +(process.env.MBPS || 4), OUT = process.env.OUT || 'run';
const S1 = '11111111-1111-1111-1111-111111111111';
const SCREENS = [
  {k: 'Home', url: '/home', text: 'Next 5 Days'},
  {k: 'Projects', url: '/sites', text: 'Cleveland Primary School'},
  {k: 'Hub', url: '/pm/hub', text: 'Chase scaffold'},
  {k: 'Finance', url: '/fin', text: 'Overdue invoices'},
  {k: 'Sales', url: '/fin/sales', text: 'Raise Invoice'},
  {k: 'Purchases', url: '/fin/purchases?tab=invoices&f=unpaid', text: 'SIG-'},
  {k: 'Materials', url: `/sites/${S1}/materials/requests`, text: 'Item 1'},
  {k: 'To-dos', url: `/sites/${S1}/todos`, text: 'Chase scaffold'},
].filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s.k));

// The export, compressed as Vercel sends it; any page that isn't a file gets index.html (the app is one page).
function serveDir(dir) {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      let f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
      const ext = path.extname(f), type = {'.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon'}[ext] || 'application/octet-stream';
      let body = fs.readFileSync(f); const head = {'Content-Type': type};
      if (/\.(js|html|css|json)$/.test(ext) && /gzip/.test(q.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); head['Content-Encoding'] = 'gzip'; }
      head['Content-Length'] = body.length; r.writeHead(200, head); r.end(body);
    });
    srv.listen(0, () => res({srv, port: srv.address().port}));
  });
}
const isDb = (u) => /supabase\.co/.test(u);
const what = (u) => { const x = new URL(u); return x.pathname.replace(/^\/rest\/v1\//, '').replace(/^\/functions\/v1\//, 'fn:').replace(/^\/auth\/v1\//, 'auth:'); };

async function watch(page, t0) {
  const st = {n: 0, inflight: 0, lastEnd: 0, lastStart: 0, bytes: 0, js: 0, jsFiles: 0, tables: {}, firstDb: null};
  page.on('request', (r) => { if (!isDb(r.url())) return; st.n++; st.inflight++; const t = Date.now() - t0; st.lastStart = t; if (st.firstDb == null) st.firstDb = t; const k = r.method() + ' ' + what(r.url()); st.tables[k] = (st.tables[k] || 0) + 1; });
  const done = (r) => { if (!isDb(r.url())) return; st.inflight--; st.lastEnd = Date.now() - t0; };
  page.on('requestfinished', done); page.on('requestfailed', done);
  page.on('response', async (r) => {
    const u = r.url();
    if (isDb(u)) return;
    if (/\.js(\?|$)/.test(u)) { st.jsFiles++; st.js += +(r.headers()['content-length'] || 0); }
  });
  return st;
}
async function settle(page, st, t0, text) {
  let seen = null, quietSince = null;
  for (;;) {
    const t = Date.now() - t0;
    if (t > 60000) return {usable: null, timeout: true, seen, inflight: st.inflight, lastStart: st.lastStart};
    if (seen == null && await page.getByText(text).first().isVisible().catch(() => false)) seen = t;
    const quiet = st.inflight === 0 && t - Math.max(st.lastEnd, st.lastStart) > 1500;
    if (seen != null && quiet) { if (quietSince == null) quietSince = t; if (t - quietSince > 300) return {usable: Math.max(seen, st.lastEnd)}; } else quietSince = null;
    await page.waitForTimeout(100);
  }
}
async function throttle(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
  await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 60, downloadThroughput: MBPS * 125000, uploadThroughput: MBPS * 125000 / 4});
}

(async () => {
  const srv = process.env.APPDIR ? await serveDir(path.resolve(process.env.APPDIR)) : null;
  const B = srv ? `http://localhost:${srv.port}` : (process.env.BASE || 'http://localhost:8081');
  const browser = await chromium.launch();
  // Data sent back, counted where the fake database answers (a page's own response bodies weren't always readable).
  global.__replyBytes = 0; global.__byTable = {};
  const {ctx, db} = await makeContext(browser, 'admin', null, {viewport: {width: 1300, height: 900}, delay: DELAY, project: true, onReply: (n, what) => { global.__replyBytes += n; global.__byTable[what] = (global.__byTable[what] || 0) + n; }});
  require('./seeds/big')(db);
  const errs = [];
  // Sign in once (the session stays in the browser), then open each screen as a fresh start.
  {
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/login'); await p.waitForSelector('input[placeholder="you@yourcompany.co.uk"]', {timeout: 60000});
    await p.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await p.fill('input[type="password"]', 'pw123456');
    await p.getByText('Sign In', {exact: true}).click(); await p.waitForURL(/\/home/, {timeout: 60000}); await p.waitForTimeout(4000); await p.close();
  }
  const out = [];
  for (const s of SCREENS) {
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(`${s.k}: ${e.message}`));
    await throttle(ctx, page);
    const t0 = Date.now(); const st = await watch(page, t0); global.__replyBytes = 0; global.__byTable = {};
    await page.goto(B + s.url, {waitUntil: 'commit'});
    const r = await settle(page, st, t0, s.text); st.bytes = global.__replyBytes;
    if (r.timeout) { console.log(s.k, 'timed out', JSON.stringify(r)); await page.screenshot({path: path.join(__dirname, 'shots', 'speed', `timeout-${s.k}.png`)}); }
    const row = {screen: s.k, usable_ms: r.usable, requests: st.n, data_kb: Math.round(st.bytes / 1024), js_kb_gz: Math.round(st.js / 1024), js_files: st.jsFiles, first_db_ms: st.firstDb, last_db_ms: st.lastEnd, tables: st.tables, kb_by_table: Object.fromEntries(Object.entries(global.__byTable).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / 1024)]))};
    // The menu's red HUB count: the same number whichever screen is open (Home counts the whole Finance overview,
    // other screens the cheap count).
    row.hub_badge = await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && d.innerText === 'Hub'); let p = el; for (let i = 0; i < 4 && p; i++) { p = p.parentElement; const m = /Hub\s*(\d+)/.exec((p && p.innerText) || ''); if (m) return +m[1]; } return null; });
    // Ticking a to-do: how long until the screen shows it done, and what it asks the database for afterwards.
    if (s.k === 'To-dos' && r.usable) {
      await page.getByText('Chase scaffold').first().click(); await page.waitForTimeout(800);
      const before = {...st.tables}, n0 = st.n, tk = Date.now();
      await page.getByText('Mark Complete').first().click();
      let shown = null;
      for (let i = 0; i < 100 && shown == null; i++) { if (await page.getByText('✓ Completed: reopen').first().isVisible().catch(() => false) || !(await page.getByText('Mark Complete').first().isVisible().catch(() => false))) shown = Date.now() - tk; else await page.waitForTimeout(50); }
      await page.waitForTimeout(4000);
      row.tick_shown_ms = shown; row.tick_requests = st.n - n0;
      row.tick_tables = Object.fromEntries(Object.entries(st.tables).map(([k, v]) => [k, v - (before[k] || 0)]).filter(([, v]) => v));
      db.todos.filter((t) => t.id === 'td1').forEach((t) => { t.done = false; });
    }
    out.push(row); console.log(`${s.k.padEnd(10)} usable ${r.usable == null ? 'TIMEOUT' : (r.usable / 1000).toFixed(1) + ' s'}  requests ${String(st.n).padStart(3)}  data ${String(row.data_kb).padStart(5)} KB  js ${row.js_kb_gz} KB gz (${st.jsFiles} files)  badge ${row.hub_badge}${row.tick_shown_ms != null ? `  tick shown ${row.tick_shown_ms} ms, then ${row.tick_requests} requests` : ''}`);
    await page.close();
  }
  const dir = path.join(__dirname, 'shots', 'speed'); fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, `${OUT}.json`), JSON.stringify({delay_ms: DELAY, mbps: MBPS, base: srv ? 'export' : B, results: out, errors: errs.slice(0, 20)}, null, 1));
  if (errs.length) console.log('page errors:', errs.slice(0, 5));
  await browser.close(); if (srv) srv.srv.close();
})();
