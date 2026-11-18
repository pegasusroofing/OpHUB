// Takes the screenshots for the OpHUB user guides (docs/guides/OpHUB-Phone-Guide.md and OpHUB-Laptop-Guide.md).
// It runs the offline demo (offline/app: a pretend company, all its data inside the app, nothing reaches Supabase)
// on this laptop, signs in once per role and device, and takes every shot listed in docs/guides/shots.json.
//   node tools/guides/capture.js                 every shot
//   node tools/guides/capture.js op-sow pm-hub   only these names (both devices)
//   node tools/guides/capture.js phone/op-sow    only this one
// Pictures go to docs/guides/shots/<device>/<name>.jpg. Rebuild the offline demo first if the app has changed
// (see offline/HOW TO USE.txt), then run tools/guides/build.js to make the PDFs.
const http = require('http');
const fs = require('fs');
const path = require('path');
const {chromium} = require(path.join(__dirname, '..', 'test-harness', 'node_modules', 'playwright'));

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'offline', 'app');
const GUIDES = path.join(ROOT, 'docs', 'guides');
const PROJECT = '11111111-1111-1111-1111-111111111111'; // Studley Rd
const QUALITY = Number(process.env.QUALITY || 72);
const EMAIL = {operative: 'jake@demo.co.uk', pm: 'paula@demo.co.uk', admin: 'andy@demo.co.uk'};
// Hosts the sites map needs (its library and map tiles: public, nothing about the company is sent). All else is blocked.
const MAP_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'tiles.openfreemap.org'];
// Rough positions of the demo jobs' postcodes, for the sites map.
const GEO = {'SW4 6RZ': [51.4735, -0.1222], 'IG1 2EW': [51.5585, 0.0700], 'NN1 3AE': [52.2405, -0.8935], 'RG21 4EB': [51.2665, -1.0870]};
const DEVICE = {
  phone: {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true},
  laptop: {viewport: {width: 1300, height: 860}, deviceScaleFactor: 1},
};

// ---- a tiny static server for offline/app; any path that isn't a file gets index.html (the app finds its own screen) ----
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.map': 'application/json'};
const serve = () => new Promise((ok) => {
  const srv = http.createServer((req, res) => {
    let f;
    try { f = path.normalize(path.join(APP, decodeURIComponent(req.url.split('?')[0]))); } catch (e) { f = ''; }
    if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(APP, 'index.html');
    res.writeHead(200, {'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    fs.createReadStream(f).pipe(res);
  });
  srv.listen(0, '127.0.0.1', () => ok(srv));
});

// ---- helpers ----
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Wait until the page has something on it and nothing says "Loading" or spins.
const settle = async (page, min = 1200) => {
  await sleep(min);
  for (let i = 0; i < 40; i++) {
    const busy = await page.evaluate(() => {
      const t = document.body ? document.body.innerText : '';
      if (t.trim().length < 20) return true;
      if (/Loading…|Loading\.\.\.|Loading$/m.test(t)) return true;
      const spin = [...document.querySelectorAll('[role="progressbar"]')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return spin;
    }).catch(() => true);
    if (!busy) break;
    await sleep(300);
  }
  await sleep(600);
};
// The first visible element with exactly this text (or matching this regex).
const find = async (page, text, {exact = true, nth = 0} = {}) => {
  const loc = typeof text === 'string' ? page.getByText(text, {exact}) : page.getByText(text);
  const n = await loc.count();
  const vis = [];
  for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) vis.push(loc.nth(i));
  if (!vis.length) throw new Error(`can't find "${text}"`);
  return vis[Math.min(nth, vis.length - 1)];
};
const tap = async (page, text, opts = {}) => { const el = await find(page, text, opts); await el.click(); await settle(page, opts.wait || 900); };
const tapLabel = async (page, label) => { await page.getByLabel(label, {exact: true}).first().click(); await settle(page, 900); };
// Scroll a React Native ScrollView so this text sits near the top.
const scrollTo = async (page, text, opts = {}) => {
  const el = await find(page, text, opts);
  await el.evaluate((e, block) => e.scrollIntoView({block, inline: 'nearest'}), opts.block || 'start');
  await sleep(500);
  if (opts.up) await el.evaluate((e, up) => { let p = e.parentElement; while (p) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) { p.scrollTop -= up; break; } p = p.parentElement; } }, opts.up);
  await sleep(400);
};

// Pop-ups that open by themselves and would hide the page: "Needs your signature" (Not now) and the PM's
// "Add your mobile number" (a demo number is saved, in this browser only, so it doesn't ask again).
const dismiss = async (page) => {
  for (let k = 0; k < 3; k++) {
    const nn = page.getByText('Not now', {exact: true});
    if (await nn.first().isVisible().catch(() => false)) { await nn.first().click(); await sleep(700); continue; }
    const mob = page.getByText(/Add your mobile number/);
    if (await mob.first().isVisible().catch(() => false)) {
      const top = (await mob.first().boundingBox()).y;
      const inputs = page.locator('input:visible');
      for (let i = 0; i < await inputs.count(); i++) { const bb = await inputs.nth(i).boundingBox(); if (bb && bb.y > top) { await inputs.nth(i).fill('07700 900111'); break; } }
      await page.getByText('OK', {exact: true}).first().click(); await sleep(900);
      continue;
    }
    break;
  }
};

// The demo starts with Jake on site: check him out first, so the page shows Not checked in and the Check In button.
const checkOut = async (page) => {
  const out = page.getByText('Check Out', {exact: true});
  if (!(await out.first().isVisible().catch(() => false))) return;
  await out.first().click(); await settle(page, 2500); await dismiss(page);
};

// ---- what to do on each shot after it has loaded (from "what" in shots.json) ----
const ACT = {
  'phone/nav-side-menu': async (p) => { await tapLabel(p, 'Open the menu'); },
  'phone/op-checkin': async (p) => { await checkOut(p); },
  'laptop/op-checkin': async (p) => { await checkOut(p); },
  'laptop/pm-admin-roles': async (p) => { await scrollTo(p, 'Your Roles', {up: 20}); },
  'phone/fin-reports': async (p) => { await tap(p, /Company overview/i); },
  'phone/op-variations': async (p) => { await scrollTo(p, /Raise a variation/i, {up: 10}); },
  'phone/op-drawings': async (p) => { await tap(p, 'Drawings'); },
  'phone/pm-geofence': async (p) => { await scrollTo(p, 'Site Geofence', {up: 10}); await tap(p, 'Set Site Location'); },
  'phone/pm-team': async (p) => { await tap(p, /Team — operatives/); await tap(p, 'Assign Operatives to Project'); },
  'phone/pm-sow': async (p) => { await tap(p, /^\+ Section/); },
  'phone/pm-coshh': async (p) => { await tap(p, 'Create COSHH'); },
  'phone/pm-permits': async (p) => { await tap(p, '+ Issue Permit'); },
  'phone/pm-order': async (p) => { await tap(p, /Order from Merchant/); },
  'phone/pm-drawings': async (p) => { await tap(p, '+'); },
  'phone/pm-admin-roles': async (p) => { await scrollTo(p, 'In This Role', {up: 120}); },
  'laptop/pm-tbt': async (p) => { await tap(p, 'TBT Library'); },
  'laptop/fin-boq': async (p) => { await tap(p, /Import \/ Export/); },
  'laptop/fin-reports': async (p) => { await tap(p, /Cost value reconciliation/); },
  'laptop/pm-geofence': async (p) => { await tap(p, 'Set Site Location'); await tap(p, /Input GPS Co-Ordinates/); },
  'laptop/pm-team': async (p) => { await tap(p, /Team — operatives/); await tap(p, 'Assign Operatives to Project'); },
  'laptop/pm-project-settings': async (p) => { await tap(p, /Site set up/); },
  'laptop/pm-sow': async (p) => { await tap(p, '⋯'); },
  'laptop/pm-requests': async (p) => { await tap(p, /Order from Merchant/); },
  'laptop/pm-subcontracts': async (p) => { await tap(p, '+ New Subcontract Order'); },
  'laptop/pm-drawings': async (p) => { await tap(p, '+'); },
};

(async () => {
  const shots = JSON.parse(fs.readFileSync(path.join(GUIDES, 'shots.json'), 'utf8'));
  const want = process.argv.slice(2);
  const todo = shots.filter((s) => !want.length || want.includes(s.name) || want.includes(`${s.device}/${s.name}`));
  const srv = await serve();
  const B = `http://127.0.0.1:${srv.address().port}`;
  console.log(`demo on ${B}; ${todo.length} shots`);
  const browser = await chromium.launch({args: ['--disable-lcd-text']});
  const ctxs = {};
  const errors = [];
  // One signed-in context per role and device, reused for every shot.
  const context = async (device, role) => {
    const key = `${device}/${role}`;
    if (ctxs[key]) return ctxs[key];
    const ctx = await browser.newContext({...DEVICE[device], serviceWorkers: 'block'});
    // Only this laptop: nothing may reach the internet. The demo answers Supabase itself; a picture or file the page
    // loads straight from Supabase gets the demo's own copy (what the demo's service worker does on a phone).
    await ctx.route((u) => !u.href.startsWith(B), (r) => {
      const u = new URL(r.request().url());
      if (MAP_HOSTS.includes(u.hostname)) return r.continue();
      if (!/supabase\.co$/.test(u.hostname)) return r.abort();
      const own = /\.pdf$/i.test(u.pathname) ? 'sample.pdf' : /org-logos/.test(u.pathname) ? 'icon.png' : 'photo.jpg';
      return r.fulfill({path: path.join(APP, 'offline', own)});
    });
    // The sites map finds each job from its postcode: give it the demo's positions, so no postcode leaves this laptop.
    await ctx.addInitScript((geo) => { try { localStorage.setItem('ophub_pc_geo_v1', JSON.stringify(geo)); } catch (e) { /* */ } }, GEO);
    // Check-ins need a location: near Studley Rd (the demo job has no check-in area set, so any spot will do).
    await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({latitude: 51.4735, longitude: -0.1222});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { page._errs = page._errs || []; page._errs.push(e.message); });
    if (role !== 'signedout') {
      await page.goto(B + '/login'); await settle(page, 2500);
      await page.fill('input[placeholder="you@yourcompany.co.uk"]', EMAIL[role]);
      await page.fill('input[type="password"]', 'anything');
      await page.getByText('Sign In', {exact: true}).click(); await settle(page, 4000);
      if (role === 'operative') {
        // As a PM would from the tile's ⋮ menu: show Expenses and HAVS to operatives on Studley Rd (off by default).
        await page.evaluate(([id, key]) => {
          const db = window.__ophubOffline.db, s = db.sites.find((x) => x.id === id);
          s.materials_visibility = {...(s.materials_visibility || {}), expenses: ['site_manager', 'operative']};
          s.tile_visibility = {...(s.tile_visibility || {}), hs_havs: ['site_manager', 'operative']};
          localStorage.setItem(key, JSON.stringify(db));
        }, [PROJECT, 'ophub-offline-db']);
      }
    }
    ctxs[key] = page;
    return page;
  };
  for (const s of todo) {
    const key = `${s.device}/${s.name}`;
    const signedOut = s.route === '/login';
    const page = await context(s.device, signedOut ? 'signedout' : s.role);
    page._errs = [];
    const route = s.route.replace('<project>', PROJECT);
    let note = '';
    try {
      await page.goto(B + route); await settle(page, 2000); await dismiss(page);
      if (ACT[key]) await ACT[key](page);
    } catch (e) { note = 'action: ' + e.message.split('\n')[0]; }
    const out = path.join(GUIDES, 'shots', s.device, s.name + '.jpg');
    fs.mkdirSync(path.dirname(out), {recursive: true});
    await page.screenshot({path: out, type: 'jpeg', quality: QUALITY});
    if (page._errs.length) note += (note ? '; ' : '') + 'page error: ' + page._errs.slice(0, 2).join(' | ');
    console.log((note ? 'NOTE ' : 'ok   ') + key + (note ? '  ' + note : ''));
    if (note) errors.push(`${key}: ${note}`);
  }
  await browser.close(); srv.close();
  console.log(`\n${todo.length} shots taken; ${errors.length} with notes`);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) process.exitCode = 1;
})();
