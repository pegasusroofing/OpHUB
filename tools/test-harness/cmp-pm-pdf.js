// Old app vs new app: the PDFs the project manager screens make (5 Nov 2026). Fake database only.
//   node cmp-pm-pdf.js [name,name]
// Saves shots/cmp/pm/pdf/<name>-old.pdf and <name>-new.pdf, and a picture of page 1 of each side by side
// (<name>.png), drawn with the pdf.js the harness already has.
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'shots', 'cmp', 'pm', 'pdf'); fs.mkdirSync(OUT, {recursive: true});
const s = (p) => `#/site/${S1}/${p}`, n = (p) => `/sites/${S1}/${p}`;
// name, old route, old export call, new route, new button text(s) to press in order
const CASES = [
  ['snags', s('snagging/list'), `exportSnaggingPDF('${S1}','live')`, n('snagging/list'), ['Export Live']],
  ['variations', s('snagging/variations'), `exportVariationsPDF('${S1}','both')`, n('snagging/variations'), ['Export All']],
  ['incident', s('hs/incidents/i1'), "exportIncidentPdf('i1')", n('hs/incidents/i1'), ['Export PDF']],
  ['schedule', s('schedule'), `exportSchedulePDF('${S1}')`, n('schedule'), ['📄 Export', /^(📄 )?PDF$/]],
  ['puwer', s('hs/puwer'), `exportPuwerCollective('${S1}')`, n('hs/puwer'), ['Export All']],
  ['matrix', '#/operatives', 'exportTrainingMatrixPdf()', '/pm/operatives', ['📄 Export Training Matrix (PDF)']],
];
const only = process.argv[2] ? process.argv[2].split(',') : null;
const list = CASES.filter((c) => !only || only.includes(c[0]));
function seed(db) {
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {role: 'pm', howto_dismissed: ['*'], signature_path: 'sig/me.png', name: 'Paula PM'});
  const now = new Date().toISOString();
  db.variations = [{id: 'va1', site_id: S1, org_id: db.organizations[0].id, description: 'Extra lead flashing to rear dormer', approval_status: 'approved', status: 'live', cost_impact: 450, raised_by: 'o1', created_by: 'o1', created_at: now}];
  db.incident_reports.forEach((r) => Object.assign(r, {location: 'Rear scaffold', incident_date: now.slice(0, 10), filed_by_name: 'Jake Morris', detail: 'Slipped on wet ladder rung', created_by: 'o1'}));
  db.operative_certifications = [{id: 'oc1', operative_id: 'o1', org_id: db.organizations[0].id, cert_type: 'CSCS', expiry_date: '2027-06-30', created_at: now}];
}
const grab = () => {
  const orig = URL.createObjectURL; window.__pdfs = [];
  URL.createObjectURL = function (b) { try { if (b && /pdf/.test(b.type || '')) b.arrayBuffer().then((a) => window.__pdfs.push(Array.from(new Uint8Array(a)))); } catch (e) { /* ignore */ } return orig.call(URL, b); };
};
async function render(browser, file) {
  // Page 1 as a picture, via pdf.js from the CDN-free copy in node_modules if there is one.
  const lib = ['pdfjs-dist/legacy/build/pdf.min.js', 'pdfjs-dist/build/pdf.min.js'].map((p) => path.join(__dirname, 'node_modules', p)).find((p) => fs.existsSync(p));
  if (!lib || !fs.existsSync(file)) return null;
  const page = await browser.newPage({viewport: {width: 700, height: 1000}});
  await page.setContent('<canvas id="c"></canvas>');
  await page.addScriptTag({content: fs.readFileSync(lib, 'utf8')});
  const data = fs.readFileSync(file).toString('base64');
  const url = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = '';
    const doc = await lib.getDocument({data: u, disableWorker: true}).promise; const p = await doc.getPage(1);
    const vp = p.getViewport({scale: 700 / p.getViewport({scale: 1}).width}); const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height;
    await p.render({canvasContext: c.getContext('2d'), viewport: vp}).promise; return c.toDataURL('image/png') + '|' + doc.numPages;
  }, data).catch((e) => 'ERR ' + e.message);
  await page.close();
  return url;
}
(async () => {
  const browser = await chromium.launch();
  const opt = {viewport: {width: 1300, height: 1000}};
  { // old
    const {srv, port} = await serve();
    const {ctx, db} = await makeContext(browser, 'pm', [], opt); seed(db);
    await ctx.route(/pdf-lib.*\.js/, (r) => r.fulfill({status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'), 'utf8')}));
    await ctx.addInitScript(grab);
    const page = await ctx.newPage(); page.on('dialog', (d) => d.accept().catch(() => {}));
    await login(page, port);
    for (const [name, route, call] of list) {
      await page.evaluate((h) => go(h), route); await page.waitForTimeout(3000);
      await page.evaluate(() => { try { pdfViewerState = null; } catch (e) { /* none */ } });
      const before = await page.evaluate(() => (window.__pdfs || []).length);
      await page.evaluate((js) => eval(js), call).catch((e) => console.log(name, 'old call', String(e).slice(0, 80)));
      let bytes = null;
      for (let i = 0; i < 30 && !bytes; i++) {
        await page.waitForTimeout(500);
        bytes = await page.evaluate((b) => { try { if (pdfViewerState && pdfViewerState.bytes) return Array.from(pdfViewerState.bytes); } catch (e) { /* none */ } return (window.__pdfs || [])[b] || null; }, before);
        if (!bytes && i === 6) { // a "PDF or OneDrive?" style question: pick PDF / Download
          await page.getByText(/^(📄 )?(PDF|Download|Download PDF|One PDF)$/).first().click({timeout: 800}).catch(() => {});
        }
      }
      if (bytes) fs.writeFileSync(path.join(OUT, `${name}-old.pdf`), Buffer.from(bytes));
      console.log(name, 'old', !!bytes);
      await page.keyboard.press('Escape').catch(() => {});
    }
    await ctx.close(); srv.close();
  }
  { // new
    const {ctx, db} = await makeContext(browser, 'admin', [], opt); seed(db);
    await ctx.addInitScript(grab);
    const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('new error', e.message.slice(0, 120)));
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    for (const [name, , , route, presses] of list) {
      await page.goto('http://localhost:8081' + route); await page.waitForTimeout(5000);
      const before = await page.evaluate(() => (window.__pdfs || []).length);
      for (const t of presses) { await page.getByText(t, typeof t === 'string' ? {exact: true} : {}).first().click({timeout: 3000}).catch((e) => console.log(name, 'new press', String(t), e.message.slice(0, 60))); await page.waitForTimeout(900); }
      await page.getByText(/^📄 ?PDF$|^PDF$/).first().click({timeout: 1500}).catch(() => {});
      let bytes = null;
      for (let i = 0; i < 30 && !bytes; i++) { await page.waitForTimeout(500); bytes = await page.evaluate((b) => (window.__pdfs || [])[b] || null, before); }
      if (!bytes) await page.screenshot({path: path.join(OUT, name + '-new-fail.png')});
      if (bytes) fs.writeFileSync(path.join(OUT, `${name}-new.pdf`), Buffer.from(bytes));
      console.log(name, 'new', !!bytes);
    }
    await ctx.close();
  }
  for (const [name] of list) {
    const a = await render(browser, path.join(OUT, `${name}-old.pdf`)), b = await render(browser, path.join(OUT, `${name}-new.pdf`));
    if (!a && !b) continue;
    const pg = await browser.newPage({viewport: {width: 1430, height: 1000}});
    const cell = (u, l) => `<div style="width:700px"><div style="background:${l === 'OLD' ? '#333' : '#c00'};color:#fff;padding:4px 8px;font:bold 15px Arial">${l} — ${name} (${u && !u.startsWith('ERR') ? u.split('|')[1] + ' pages' : u ? u.slice(0, 60) : 'no PDF'})</div>${u && !u.startsWith('ERR') ? `<img style="width:700px;border:1px solid #999" src="${u.split('|')[0]}">` : ''}</div>`;
    await pg.setContent(`<body style="margin:0;display:flex;gap:10px;background:#888;align-items:flex-start">${cell(a, 'OLD')}${cell(b, 'NEW')}</body>`);
    await pg.waitForTimeout(300);
    const h = await pg.evaluate(() => document.body.scrollHeight);
    await pg.setViewportSize({width: 1430, height: Math.min(h, 1200)});
    await pg.screenshot({path: path.join(OUT, `${name}.png`)}); await pg.close();
  }
  await browser.close();
})();
