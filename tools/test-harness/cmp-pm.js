// Old app vs new app, side by side, for the project manager screens (4-5 Nov 2026). Fake database only.
//   W=390|1300 ROLE=pm|client ONLY=name,name node cmp-pm.js
// For each screen it saves, in shots/cmp/pm/:
//   <name>-old-<w>.png / <name>-new-<w>.png   the whole page (the window is stretched to the page's height)
//   <name>-<w>.png                            both side by side (OLD left, NEW right), for reading quickly
//   <name>-old-<w>.json / -new-<w>.json      every button, link, box and drop-down on the page, and its text lines
// Then `node cmp-pm.js diff` prints, per screen, the buttons and words found in one app but not the other.
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const S2 = '22222222-2222-2222-2222-222222222222';
const W = +(process.env.W || 1300), ROLE = process.env.ROLE || 'pm';
const OUT = path.join(__dirname, 'shots', 'cmp', 'pm'); fs.mkdirSync(OUT, {recursive: true});
const s = (p) => `#/site/${S1}/${p}`, n = (p) => `/sites/${S1}${p ? '/' + p : ''}`;
// name, old route, new route, optional JS to run in the old app after it opens
const SCREENS = [
  ['pmhome', '#/home', '/home'],
  ['dashboard', '#/dashboard', '/pm/dashboard'],
  ['projects', '#/sites', '/sites'],
  ['newjob', '#/sites', '/sites/new', 'toggleAddSiteForm()'],
  ['jobhome', s('home'), n('')],
  ['schedule', s('schedule'), n('schedule')],
  ['team', s('team'), n('admin')],
  ['checkin', s('checkin'), n('checkin')],
  ['checkinlogs', '#/team/people/checkinlogs', '/pm/admin/checkinlogs'],
  ['hs', s('hs'), n('hs')],
  ['rams', s('hs/rams'), n('hs/rams')],
  ['ramsnew', s('hs/rams/new'), n('hs/rams/new')],
  ['ramsbuild', s('hs/rams/build/b1'), n('hs/rams/build/b1')],
  ['coshh', s('hs/coshh'), n('hs/coshh')],
  ['coshhnew', s('hs/coshh/new'), n('hs/coshh/new')],
  ['coshhpick', s('hs/coshh-pick'), n('hs/coshh/pick')],
  ['coshhlib', '#/coshh-substances', '/pm/admin/coshh'],
  ['tbt', s('hs/tbt'), n('hs/tbt')],
  ['permits', s('mc/permits'), n('mc/permits')],
  ['incidents', s('hs/incidents'), n('hs/incidents')],
  ['incidentnew', s('hs/incidents/new'), n('hs/incidents/new')],
  ['havs', s('hs/havs'), n('hs/havs')],
  ['puwer', s('hs/puwer'), n('hs/puwer')],
  ['havspuwer', s('hs/havspuwer'), n('hs/havspuwer')],
  ['loler', s('hs/loler'), n('hs/loler')],
  ['inductions', s('mc/site_inductions'), n('mc/inductions')],
  ['ppe', s('ppe'), n('ppe')],
  ['siterules', s('mc/site_layout'), n('mc/layout')],
  ['operatives', '#/operatives', '/pm/operatives'],
  ['operative', '#/operatives/o1', '/pm/operatives/o1'],
  ['snagfolder', s('snagging'), n('snagging')],
  ['snags', s('snagging/list'), n('snagging/list')],
  ['variations', s('snagging/variations'), n('snagging/variations')],
  ['materials', s('materials'), n('materials')],
  ['matrequests', s('materialrequests'), n('materials/requests')],
  ['matpos', s('materialorders'), n('materials/pos')],
  ['collections', s('materialrequired'), n('materials/collections')],
  ['deliveries', '#/deliveries', '/pm/deliveries'],
  ['delschedule', '#/delivery', '/pm/deliveries'],
  ['plant', s('plant'), n('plant')],
  ['calendar', s('calendar'), n('calendar')],
  ['homecal', '#/calendar', '/pm/calendar'],
  ['drawings', s('drawings'), n('drawings')],
  ['drawfolder', s('drawings/df1'), n('drawings/df1')],
  ['price', s('price'), n('price')],
  ['pricesheets', s('pricebuilder'), n('price/sheets')],
  ['repairs', `#/site/${S2}/repairjobs`, `/sites/${S2}/repairs`],
  ['handover', s('handover'), n('handover')],
  ['quotes', '#/home', '/pm/quotes'],
  ['reports', '#/reports', '/pm/reports'],
  ['sitereports', s('snagging/reports'), n('snagging/reports')],
  ['templates', '#/templates', '/pm/admin/templates'],
  ['mchome', s('mc'), n('mc')],
  ['mcinspections', s('mc/inspections'), n('mc/inspections')],
  ['subcontractors', s('mc/subcontractors'), n('mc/subcontractors')],
  ['subcompany', s('mc/subcontractors/sc1'), n('mc/subcontractors/sc1')],
  ['todos', s('todos'), n('todos')],
  ['documents', s('home'), n('documents')],
  // Last: its pop-up stays open in the old app.
  ['yard', s('materials'), n('materials/yard'), "yardPmOpen(" + JSON.stringify(S1) + ")"],
];
const CLIENT = [['client-home', s('home'), n('')], ['client-schedule', s('schedule'), n('schedule')], ['client-hs', s('hs'), n('hs')], ['client-snags', s('snagging'), n('snagging')], ['client-projects', '#/sites', '/sites']];

function seedBoth(db) {
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {role: ROLE, howto_dismissed: ['*'], signature_path: 'sig/me.png', name: ROLE === 'client' ? 'Clara Client' : 'Paula PM'});
  if (ROLE === 'client') me.finance_enabled = false;
  const st1 = db.sites.find((x) => x.id === S1), st2 = db.sites.find((x) => x.id === S2);
  Object.assign(st1, {price_enabled: true, client_phone: '07111 222333', client_contact_name: 'Jo Smith'});
  Object.assign(st2, {repair_contract: true});
  db.repair_jobs = (db.repair_jobs || []).map((r) => Object.assign({}, r, {site_id: S2}));
  db.site_assignments.push({id: 'sam1', site_id: S1, user_id: 'me'}, {id: 'sam2', site_id: S2, user_id: 'me'});
  if (ROLE === 'client') db.site_client_access = [{id: 'sca1', site_id: S1, user_id: 'me'}];
}
// Every clickable thing on the page and its words, and every line of text.
function grabPage() {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const sel = 'button, a[href], [onclick], [role=button], [tabindex="0"], select, input, textarea, summary';
  const out = [];
  document.querySelectorAll(sel).forEach((e) => {
    if (!vis(e)) return;
    if (e.tagName !== 'SELECT' && e.querySelector(sel)) return; // the innermost one only
    let t = '';
    if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') { if (e.type === 'hidden') return; t = '[' + (e.type || 'text') + '] ' + (e.placeholder || e.getAttribute('aria-label') || e.name || e.value || ''); }
    else if (e.tagName === 'SELECT') t = '[select] ' + Array.from(e.options).map((o) => o.text).slice(0, 10).join(' / ');
    else t = (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ');
    if (t) out.push(t.slice(0, 90));
  });
  const lines = (document.body.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return {url: location.href, controls: [...new Set(out)], lines: [...new Set(lines)]};
}
async function fullShot(page, file) {
  // Stretch the window to the page's height (the new app scrolls inside a box, so fullPage alone misses the rest).
  const h = await page.evaluate(() => { let m = document.documentElement.scrollHeight; document.querySelectorAll('div').forEach((d) => { if (d.scrollHeight > d.clientHeight + 4 && d.clientHeight > 200) m = Math.max(m, d.scrollHeight + (d.getBoundingClientRect().top || 0)); }); return m; });
  const base = W < 500 ? 844 : 1000;
  await page.setViewportSize({width: W, height: Math.round(Math.min(Math.max(base, h + 20), 4200))}); await page.waitForTimeout(600);
  await page.screenshot({path: file, fullPage: true});
  await page.setViewportSize({width: W, height: base});
}
async function sideBySide(browser, name) {
  const a = path.join(OUT, `${name}-old-${W}.png`), b = path.join(OUT, `${name}-new-${W}.png`);
  if (!fs.existsSync(a) || !fs.existsSync(b)) return;
  const half = W < 500 ? 390 : 900; // a computer page at 70% so both fit
  const page = await browser.newPage({viewport: {width: half * 2 + 30, height: 800}});
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  await page.setContent(`<body style="margin:0;font:bold 16px Arial;display:flex;gap:10px;background:#888;align-items:flex-start">
    <div style="width:${half}px;background:#fff"><div style="background:#333;color:#fff;padding:4px 8px">OLD — ${name}</div><img style="width:${half}px" src="${img(a)}"></div>
    <div style="width:${half}px;background:#fff"><div style="background:#c00;color:#fff;padding:4px 8px">NEW — ${name}</div><img style="width:${half}px" src="${img(b)}"></div></body>`);
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({width: half * 2 + 30, height: Math.min(h, 3200)});
  await page.screenshot({path: path.join(OUT, `${name}-${W}.png`), clip: {x: 0, y: 0, width: half * 2 + 30, height: Math.min(h, 3200)}});
  await page.close();
}
function diff() {
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9£%]+/g, ' ').trim();
  const files = fs.readdirSync(OUT).filter((f) => /-old-\d+\.json$/.test(f));
  for (const f of files) {
    const nf = f.replace('-old-', '-new-');
    if (!fs.existsSync(path.join(OUT, nf))) continue;
    const o = JSON.parse(fs.readFileSync(path.join(OUT, f))), w = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
    const setN = (arr) => new Set(arr.map(norm));
    const nc = setN(w.controls.concat(w.lines)), oc = setN(o.controls.concat(o.lines));
    const onlyOld = o.controls.filter((c) => !nc.has(norm(c)));
    const onlyNew = w.controls.filter((c) => !oc.has(norm(c)));
    console.log(`\n### ${f.replace('-old-', ' @').replace('.json', '')}\n  old url ${o.url}\n  new url ${w.url}`);
    console.log('  OLD ONLY:', onlyOld.join(' | ') || '-');
    console.log('  NEW ONLY:', onlyNew.join(' | ') || '-');
    if (process.env.LINES) { const lo = o.lines.filter((c) => !nc.has(norm(c))); console.log('  OLD TEXT ONLY:', lo.slice(0, 40).join(' | ')); }
  }
}
(async () => {
  if (process.argv[2] === 'diff') return diff();
  const list = (ROLE === 'client' ? CLIENT : SCREENS).filter((x) => !process.env.ONLY || process.env.ONLY.split(',').includes(x[0]));
  const browser = await chromium.launch();
  const opt = {viewport: {width: W, height: W < 500 ? 844 : 1000}};
  if (!process.env.NEWONLY) { // Old app (app.html)
    const {srv, port} = await serve();
    const {ctx, db} = await makeContext(browser, ROLE === 'client' ? 'admin' : 'pm', [], opt);
    seedBoth(db);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await login(page, port);
    for (const [name, old, , act] of list) {
      try {
        await page.evaluate((h) => { try { closeModal && closeModal(); } catch (e) { /* none */ } go(h); }, old); await page.waitForTimeout(3000);
        if (act) { await page.evaluate((js) => eval(js), act).catch((e) => console.log(name, 'act', String(e).slice(0, 80))); await page.waitForTimeout(1500); }
        await fullShot(page, path.join(OUT, `${name}-old-${W}.png`));
        fs.writeFileSync(path.join(OUT, `${name}-old-${W}.json`), JSON.stringify(await page.evaluate(grabPage), null, 1));
        console.log('old', name, page.url().split('#')[1]);
      } catch (e) { console.log('old', name, 'FAILED', e.message.slice(0, 100)); }
    }
    console.log('old errors:', [...new Set(errs)].slice(0, 6).join(' | '));
    await ctx.close(); srv.close();
  }
  { // New app (Expo dev server, already running)
    const {ctx, db} = await makeContext(browser, 'admin', [], opt);
    seedBoth(db);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    for (const [name, , neu] of list) {
      try {
        await page.goto('http://localhost:8081' + neu); await page.waitForTimeout(4500);
        await fullShot(page, path.join(OUT, `${name}-new-${W}.png`));
        fs.writeFileSync(path.join(OUT, `${name}-new-${W}.json`), JSON.stringify(await page.evaluate(grabPage), null, 1));
        console.log('new', name, page.url().replace('http://localhost:8081', ''));
      } catch (e) { console.log('new', name, 'FAILED', e.message.slice(0, 100)); }
    }
    console.log('new errors:', [...new Set(errs)].slice(0, 6).join(' | '));
  }
  for (const [name] of list) await sideBySide(browser, name).catch((e) => console.log('side', name, e.message.slice(0, 80)));
  await browser.close();
})();
