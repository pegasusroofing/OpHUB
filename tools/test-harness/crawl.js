// Presses every button on every screen against the fake database, and records what each one did.
// node crawl.js <role> <shard> <shards> [filter]   → shots/crawl/<role>-<shard>.jsonl
// Each line: {route, label, path, did:[...], problems:[...]}. Summarise with crawl-report.js.
const {chromium, makeContext} = require('./harness');
const fs = require('fs'), path = require('path');
const role = process.argv[2] || 'admin', shard = +(process.argv[3] || 0), shards = +(process.argv[4] || 1), only = process.argv[5] ? new RegExp(process.argv[5]) : null;
const WIDTH = +(process.env.WIDTH || 1300), HEIGHT = WIDTH < 500 ? 844 : 900, MAX_PER_PAGE = +(process.env.MAX || 45), DEPTH = +(process.env.DEPTH || 2), ROUTE_MS = +(process.env.ROUTE_MS || 420000);
const B = 'http://localhost:8081', S = '/sites/11111111-1111-1111-1111-111111111111';
const OUT = path.join(__dirname, 'shots', 'crawl'); fs.mkdirSync(OUT, {recursive: true});
const file = path.join(OUT, `${role}${WIDTH < 500 ? '-phone' : ''}-${shard}.jsonl`); fs.writeFileSync(file, '');
const ROUTES = ['/home', '/account', '/dashboard', '/getting-started', '/inbox', '/onsite', '/search', '/signature', '/subform',
  '/driver/checkin', '/driver/schedule', '/driver/timeoff', '/driver/vehicle', '/driver/yard',
  '/fin', '/fin/directory', '/fin/inbox/fi1', '/fin/jobs', '/fin/newjob', '/fin/purchases', '/fin/reports', '/fin/sales', '/fin/settings', '/fin/statements', '/fin/subs', '/fin/team', '/fin/yard', '/fin/yardin',
  '/fin/labour/w1', '/fin/pinv/pi1', '/fin/plant/h1', '/fin/po/po1', '/fin/sub/sc1',
  ...['', '/boq', '/budget', '/costs', '/dayworks', '/monthly', '/parts', '/quotes', '/summary', '/variations', '/application/ap2', '/invoice/v1', '?tab=sales', '?tab=purchases', '?tab=subs', '?tab=setup'].map((x) => '/fin/job/11111111-1111-1111-1111-111111111111' + x),
  ...['', '/branding', '/checkinlogs', '/companylibrary', '/companylibrary/cp1', '/coshh', '/coshh/c1', '/devicelocks', '/drivercheckins', '/expensesemail', '/havstools', '/hspolicy', '/invites', '/onedrive', '/ppelog', '/ramslibrary', '/ratecard', '/signtemplates', '/signtemplates/lt1', '/sowlibrary', '/subapps', '/subapps/ap1', '/suppliers', '/tbt', '/templates', '/templates/tp1', '/users'].map((x) => '/pm/admin' + x),
  '/pm/calendar', '/pm/dashboard', '/pm/deliveries', '/pm/delivery/dt1', '/pm/hr', '/pm/hr/holidays', '/pm/hr/policies', '/pm/hub', '/pm/onedrive-pick', '/pm/operatives', '/pm/operatives/matrix', '/pm/operatives/o1', '/pm/piquery/pi1', '/pm/reports', '/pm/sitemap', '/pm/survey/rs4', '/pm/tbts', '/pm/tobook', '/pm/todos', '/pm/vehicles',
  '/sites', '/sites/new',
  ...['', '/activity', '/admin', '/calendar', '/checkin', '/client', '/drawings', '/drawings/import', '/drawings/df1', '/expenses', '/handover', '/messages', '/om/om1', '/plant', '/ppe', '/schedule', '/todos',
    '/hs', '/hs/briefings', '/hs/briefings/rs1', '/hs/briefings/fill/rs2', '/hs/coshh', '/hs/coshh/new', '/hs/coshh/pick', '/hs/coshh/save', '/hs/havs', '/hs/havspuwer', '/hs/incidents', '/hs/incidents/new', '/hs/incidents/i1', '/hs/loler', '/hs/loler/fill/rs2', '/hs/loler/view/rs3', '/hs/mytools', '/hs/puwer', '/hs/rams', '/hs/rams/new', '/hs/rams/boxes/rd1', '/hs/rams/build/b1', '/hs/tbt', '/hs/tbt/tb1',
    '/materials', '/materials/collections', '/materials/pos', '/materials/pos/mf1', '/materials/requests', '/materials/yard',
    '/mc', '/mc/docs/general', '/mc/inductions', '/mc/inspections', '/mc/layout', '/mc/permits', '/mc/permits/pm1', '/mc/subcontractors', ...['', '/briefings', '/docs', '/inspections', '/operatives', '/schedule', '/tbt'].map((x) => '/mc/subcontractors/sc1' + x),
    '/price', '/price/e1', '/price/sheets', '/price/sheets/ps1', '/repairs', '/repairs/job/rj1', '/repairs/list/all',
    '/snagging', '/snagging/list', '/snagging/variations', '/snagging/reports', '/snagging/reports/fill/rs2', '/snagging/reports/view/rs1'].map((x) => S + x),
].filter((r, i) => i % shards === shard).filter((r) => !only || only.test(r));

// Left alone: they end the session.
const SKIP = /^(sign out|log ?out)/i;
const SAVEISH = /^(save|add|create|submit|send|issue|raise|book|post|confirm|record|update|apply|invite|upload)\b/i;
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().replace(/£?[\d,.]+%?/g, '#').slice(0, 70);

(async () => {
  const browser = await chromium.launch();
  // REAL=1: the real database, Sandbox Roofing only, behind sandbox-guard.js.
  const real = process.env.REAL ? require('./sandbox-guard') : null;
  const {ctx, db} = real ? await real.open(browser, {viewport: {width: WIDTH, height: HEIGHT}}) : await makeContext(browser, role, [], {viewport: {width: WIDTH, height: HEIGHT}});
  const pristine = real ? '{}' : (() => { require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = role; if (role === 'pm') me.name = 'Paula PM'; me.finance_enabled = ['admin', 'pm'].includes(role); return JSON.stringify(db); })();
  const reset = () => { if (real) return; const fresh = JSON.parse(pristine); Object.keys(db).forEach((k) => delete db[k]); Object.assign(db, fresh); };
  if (!real) await ctx.route(/storage\/v1\/object\/(public\/|sign\/)?[a-z-]+\/.*\.pdf/, (r) => (r.request().method() === 'GET' ? r.fulfill({status: 200, contentType: 'application/pdf', body: fs.readFileSync(path.join(__dirname, 'shots/samples/sds.pdf'))}) : r.fallback()));
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({latitude: 51.46, longitude: -0.13});
  const page = await ctx.newPage(); page.setDefaultTimeout(4000);
  let ev = {errors: [], writes: [], fns: [], dialogs: [], files: 0, downloads: 0, popups: 0};
  const clear = () => { ev = {errors: [], writes: [], fns: [], dialogs: [], files: 0, downloads: 0, popups: 0}; };
  page.on('pageerror', (e) => ev.errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource|React Native Web|Warning:/.test(m.text())) ev.errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('dialog', (d) => { ev.dialogs.push(d.type() + ': ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  page.on('filechooser', () => { ev.files++; });
  page.on('download', () => { ev.downloads++; });
  ctx.on('page', (p) => { ev.popups++; p.close().catch(() => {}); });
  page.on('request', (r) => { const u = r.url(), m = r.method(); if (!/supabase\.co/.test(u)) return; if (/\/functions\/v1\//.test(u)) ev.fns.push(u.split('/functions/v1/')[1].split('?')[0]); else if (/\/rest\/v1\/rpc\//.test(u)) ev.writes.push('rpc ' + u.split('/rpc/')[1].split('?')[0]); else if (m !== 'GET' && m !== 'HEAD' && /\/rest\/v1\//.test(u)) ev.writes.push(m + ' ' + u.split('/rest/v1/')[1].split('?')[0]); else if (m === 'POST' && /\/storage\//.test(u) && !/\/sign\//.test(u)) ev.writes.push('upload'); });

  if (!real) { await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000); }

  // Everything tappable that's on show, in the page itself (not the side menu or the top bar).
  const scan = () => page.evaluate((width) => {
    const out = [], seen = new Set();
    const els = document.querySelectorAll('[tabindex="0"], [role="button"], [role="link"], a[href], button, input[type="checkbox"], select');
    els.forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden="true"]')) return;
      if (['TEXTAREA', 'INPUT'].includes(el.tagName) && el.type !== 'checkbox') return;
      if (width >= 768 && r.left < 248 && r.right <= 248) return;  // side menu
      if (r.top + scrollY < 80 && r.bottom + scrollY <= 80) return;  // top bar
      const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim();
      el.setAttribute('data-crawl', String(out.length));
      out.push({i: out.length, label, x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true});
    });
    return out;
  }, WIDTH);
  const fingerprint = () => page.evaluate(() => { const t = document.body.innerText; let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h + ':' + document.querySelectorAll('*').length; });
  const url = () => page.url().replace(B, '');
  const pageChecks = async () => page.evaluate((width) => {
    const p = [], txt = document.body.innerText;
    if (document.documentElement.scrollWidth > window.innerWidth + 2) p.push(`sideways scroll (${document.documentElement.scrollWidth}px wide)`);
    if (/Unmatched Route|This screen doesn|Page not found/i.test(txt)) p.push('not-found page');
    if (/\b(undefined|NaN|\[object Object\]|Invalid Date)\b/.test(txt)) p.push('junk on screen: ' + (txt.match(/.{0,30}\b(undefined|NaN|\[object Object\]|Invalid Date)\b.{0,20}/) || [''])[0]);
    if (document.querySelector('input[placeholder="YYYY-MM-DD"]')) p.push('typed date box, not a calendar');
    if (document.querySelector('input[type="date"]')) p.push('browser date box');
    return p;
  }, WIDTH);
  // A pop-up that sticks out of the screen, or uses OK/Cancel where Andy's rule says Yes/No.
  const popupChecks = async () => page.evaluate(() => {
    const p = [], all = [...document.querySelectorAll('div')].filter((d) => { const c = getComputedStyle(d); return c.position === 'fixed' && d.offsetWidth > 100 && d.offsetHeight > 40; });
    all.forEach((d) => { const r = d.getBoundingClientRect(); if (r.width < innerWidth - 2 && (r.left < -2 || r.right > innerWidth + 2 || r.top < -2 || r.bottom > innerHeight + 2)) p.push(`pop-up off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`); });
    return p;
  });
  const fresh = async (route) => { await page.goto(B + route, {waitUntil: 'domcontentloaded'}); await page.waitForTimeout(2600); };
  const closePopups = async () => { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150); };
  const log = (o) => fs.appendFileSync(file, JSON.stringify(o) + '\n');

  const press = async (route, c, trail) => {
    clear();
    const before = await fingerprint().catch(() => ''), u0 = url();
    const settle = async () => { await page.mouse.move(1, 1).catch(() => {}); await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {}); };
    await settle();
    const pic0 = await page.screenshot().catch(() => null), words0 = new Set((await page.evaluate(() => document.body.innerText).catch(() => '')).split('\n'));
    let filled = 0;
    if (SAVEISH.test((c.label || '').trim())) {
      const boxes = page.locator('input:visible:not([type=checkbox]):not([type=file]):not([type=password]), textarea:visible');
      const n = Math.min(await boxes.count().catch(() => 0), 15);
      for (let i = 0; i < n; i++) { const b = boxes.nth(i); const a = await b.evaluate((x) => ({v: x.value, ph: x.placeholder || '', m: x.inputMode || '', ro: x.readOnly})).catch(() => null); if (!a || a.v || a.ro || /search|filter/i.test(a.ph)) continue; await b.fill(/decimal|numeric/.test(a.m) ? '10' : /email|@/i.test(a.ph) || a.m === 'email' ? (real ? 'test@example.com' : 'test@x.co') : 'Test').catch(() => {}); filled++; }
      if (filled) await page.waitForTimeout(150);
    }
    const el = page.locator(`[data-crawl="${c.i}"]`).first();
    try { await el.click({timeout: 2000}); }
    catch (e) { const blocked = /intercepts pointer|outside of the viewport/.test(e.message); log({route, role, label: c.label, trail, did: [], problems: [blocked ? 'covered: something sits on top of it' : 'could not press']}); return {kind: 'stuck'}; }
    await page.waitForTimeout(700);
    await settle();
    const after = await fingerprint().catch(() => ''), u1 = url();
    const pic1 = await page.screenshot().catch(() => null), picChanged = !!(pic0 && pic1 && !pic0.equals(pic1));
    const said = (await page.evaluate(() => document.body.innerText).catch(() => '')).split('\n').map((x) => x.trim()).filter((x) => x && x.length < 110 && !words0.has(x)).slice(0, 3);
    const did = [], problems = [...new Set(ev.errors)].map((x) => 'error: ' + x);
    if (u1 !== u0) did.push('nav ' + u1);
    if (after !== before || picChanged) did.push('changed');
    if (filled) did.push('filled ' + filled);
    if (said.length) did.push('said: ' + said.join(' / '));
    if (ev.writes.length) did.push('wrote ' + [...new Set(ev.writes)].join(','));
    if (ev.fns.length) did.push('fn ' + [...new Set(ev.fns)].join(','));
    if (ev.files) did.push('file picker');
    if (ev.downloads) did.push('download');
    if (ev.popups) did.push('new tab');
    if (ev.dialogs.length) problems.push('browser pop-up, not the in-app one: ' + ev.dialogs[0]);
    if (!did.length && !c.disabled) problems.push('nothing happened');
    problems.push(...await pageChecks().catch(() => []), ...await popupChecks().catch(() => []));
    const shownErr = await page.evaluate(() => { const m = document.body.innerText.match(/(Could not [^\n.]{0,60}|Something went wrong[^\n]{0,40}|failed[^\n]{0,40})/i); return m ? m[0] : ''; }).catch(() => '');
    if (shownErr) did.push('message: ' + shownErr);
    log({route, role, label: c.label, trail, did, problems});
    return {kind: u1 !== u0 ? 'nav' : (after !== before ? 'changed' : picChanged ? 'look' : 'none'), u1};
  };

  for (const route of real ? await real.routes(ROUTES) : ROUTES) {
    const t0 = Date.now(); reset(); clear();
    try {
      await fresh(route);
      const land = url(); const errs = [...new Set(ev.errors)].map((x) => 'error: ' + x);
      const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
      const blocked = /Managers only|Project Managers and admins only|isn.t switched on|not allowed|no access|Admins only/i.test(text);
      const items = await scan();
      log({route, role, load: true, land, blocked, buttons: items.length, words: text.length, problems: [...errs, ...await pageChecks()], did: []});
      if (blocked || land.split('?')[0] !== route.split('?')[0]) continue;
      if (process.env.LOAD_ONLY) continue;
      const done = new Set();
      const list = items.filter((c) => { const k = norm(c.label) || `#${c.x},${c.w}`; if (done.has(k) || SKIP.test(c.label)) return false; done.add(k); return true; }).slice(0, MAX_PER_PAGE);
      if (items.length > list.length) log({route, role, note: `${items.length} buttons, ${list.length} distinct pressed`, problems: [], did: []});
      for (const c of list) {
        if (Date.now() - t0 > ROUTE_MS) { log({route, role, note: 'ran out of time on this screen', problems: [], did: []}); break; }
        reset(); await fresh(route); await scan();
        const r = await press(route, c, []);
        // A menu or pop-up: press what's in it too.
        if (DEPTH >= 2 && r.kind === 'changed') {
          const inner = (await scan()).filter((x) => !SKIP.test(x.label));
          const known = new Set(items.map((x) => norm(x.label)));
          const fresh2 = inner.filter((x) => !known.has(norm(x.label))).slice(0, 12);
          const seen2 = new Set();
          for (const k of fresh2) {
            const nk = norm(k.label) || `#${k.x}`; if (seen2.has(nk)) continue; seen2.add(nk);
            if (Date.now() - t0 > ROUTE_MS) break;
            reset(); await fresh(route); await scan();
            const again = await press(route, c, ['(reopen)']).catch(() => ({kind: 'stuck'}));
            if (again.kind === 'stuck') break;
            const now = await scan(); const tgt = now.find((x) => norm(x.label) === norm(k.label) && (norm(k.label) || x.x === k.x));
            if (!tgt) continue;
            const r2 = await press(route, tgt, [c.label]);
            // A "Delete" that asks first: say yes, so the action itself gets run.
            if (r2.kind === 'changed') {
              const yes = (await scan()).find((x) => /^(yes|delete|remove|confirm|ok|save|send|import|close|reopen|archive|approve|reject|void|cancel po)\b/i.test(x.label.trim()) && !known.has(norm(x.label)) && norm(x.label) !== norm(k.label));
              if (yes) await press(route, yes, [c.label, k.label]);
            }
          }
        }
      }
    } catch (e) { log({route, role, crash: e.message.slice(0, 200), problems: ['crawler stopped on this screen'], did: []}); }
    await closePopups();
  }
  await browser.close(); process.exit(0);
})();
