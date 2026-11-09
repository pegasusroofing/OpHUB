// Makes the offline demo of the new app (Andy, 9 Nov 2026: "an offline version for my flight, and for the phone too").
//   1. cd app-native && npx expo export --platform web --output-dir ../offline/app
//   2. node tools/offline/make-offline.js
// It adds a pretend company (the screen tests' "busy company" plus a repair contract) and fakedb.js, which answers every
// Supabase request in the browser - so nothing reaches the real database - and a service worker so a phone that has
// opened it once keeps it with no signal (Add To Home Screen). offline/app is the finished site: the laptop runs it with
// "Start OpHUB Offline.bat"; the phone gets it from the web link.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'offline', 'app');
const H = path.join(ROOT, 'tools', 'test-harness');
if (!fs.existsSync(path.join(APP, 'index.html'))) throw new Error('Build the web app first: cd app-native && npx expo export --platform web --output-dir ../offline/app');

// ---- the pretend company ----
// The screen tests' starting company (as harness.js seed('admin'), copied here so this runs without Playwright, e.g. on Vercel).
const seed = () => {
  const ORG = 'e56d69c8-0000-0000-0000-000000000001', t = new Date().toISOString();
  return {
    organizations: [{id: ORG, name: 'RTB Roofing Ltd', color_primary: '#E3262B', color_secondary: '#111111', logo_path: 'logo.png', created_at: t}],
    profiles: [{id: 'me', name: 'Andy Admin', email: 'a@x.co', role: 'admin', org_id: ORG, phone: '07000 000000', created_at: t},
      {id: 'o1', name: 'Jake Morris', role: 'operative', org_id: ORG, email: 'j@x.co'}, {id: 'o2', name: 'Tom Hughes', role: 'operative', org_id: ORG, email: 't@x.co'}, {id: 'd1', name: 'Dave Driver', role: 'driver', org_id: ORG, email: 'd@x.co'}],
    sites: [{id: '11111111-1111-1111-1111-111111111111', name: 'Studley Rd', address: 'Studley Rd, London', postcode: 'SW4 6RZ', status: 'live', org_id: ORG, created_at: t, job_number: 'J101'},
      {id: '22222222-2222-2222-2222-222222222222', name: 'Cleveland Primary School', address: 'Cleveland Rd, Ilford', postcode: 'IG1 2EW', status: 'live', org_id: ORG, created_at: t, job_number: 'J102'},
      {id: '33333333-3333-3333-3333-333333333333', name: 'Simon De Senlis', address: 'Robert Street, Northampton NN1 3AE', postcode: '', status: 'upcoming', org_id: ORG, created_at: t}],
    site_assignments: [{id: 'sa1', site_id: '11111111-1111-1111-1111-111111111111', user_id: 'o1'}, {id: 'sa2', site_id: '22222222-2222-2222-2222-222222222222', user_id: 'o2'}],
  };
};
const db = seed();
require(path.join(H, 'seeds', 'world'))(db);
const O = db.organizations[0].id;
const now = new Date().toISOString();
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// Sign in with these (any password); an email not listed signs in as Andy Admin.
const who = {me: 'andy@demo.co.uk', o1: 'jake@demo.co.uk', o2: 'tom@demo.co.uk', d1: 'dave@demo.co.uk', pm2: 'paula@demo.co.uk'};
db.profiles.forEach((p) => { if (who[p.id]) p.email = who[p.id]; p.howto_dismissed = ['*']; });
if (!db.profiles.some((p) => p.id === 'pm2')) db.profiles.push({id: 'pm2', name: 'Paula PM', role: 'pm', org_id: O, email: who.pm2, howto_dismissed: ['*']});
const pm2 = db.profiles.find((p) => p.id === 'pm2'); Object.assign(pm2, {name: 'Paula PM', email: who.pm2, finance_enabled: false});
// Everyone has a signature and has signed this year's H&S Policy, so the demo opens straight on their home.
db.profiles.forEach((p) => { p.signature_path = p.signature_path || `demo/sig-${p.id}.png`; });
(db.hs_policy_docs || []).forEach((d) => db.profiles.forEach((p) => {
  if (!(db.hs_policy_signatures || []).some((s) => s.policy_id === d.id && s.user_id === p.id)) (db.hs_policy_signatures = db.hs_policy_signatures || []).push({id: `hss-${d.id}-${p.id}`, policy_id: d.id, user_id: p.id, org_id: O, signed_at: now, signature_image_path: p.signature_path});
}));
// A repair contract with jobs at each stage.
const S4 = '44444444-4444-4444-4444-444444444444';
db.sites.push({id: S4, name: 'Sovereign Repairs', address: 'Sovereign House, Basingstoke', postcode: 'RG21 4EB', status: 'live', org_id: O, created_at: now, job_number: 'J104', repair_contract: true, repair_discount_pct: 10, client_name: 'Sovereign Housing', client_contact_name: 'Jo Bloggs', client_email: 'repairs@sovereign.example', responsible_pm_id: 'me'});
db.site_assignments.push({id: 'sa4', site_id: S4, user_id: 'o1'});
db.job_finance.push({site_id: S4, org_id: O, billing_type: 'invoice', vat_treatment: 'standard', billing_name: 'Sovereign Housing', billing_email: 'repairs@sovereign.example'});
db.repair_jobs = (db.repair_jobs || []).concat([
  {id: 'dj1', org_id: O, site_id: S4, job_number: 'WO-1001', address: 'Flat 4, Oak House', description: 'Gutter overflowing', priority: 'Emergency', job_status: 'To Survey', survey_required: 'N', created_at: day(-2) + 'T09:00:00Z'},
  {id: 'dj2', org_id: O, site_id: S4, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', tenant_name: 'Mr K Hughes', tenant_phone: '07700 900456', job_status: 'To Survey', survey_required: 'N', survey_booking_date: day(1), survey_booking_slot: 'AM (8am – 12pm)', survey_booking_notes: 'Key safe 1234', survey_booking_assigned_to: 'o1', created_at: day(-4) + 'T09:00:00Z'},
  {id: 'dj3', org_id: O, site_id: S4, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', tenant_name: 'Mrs A Patel', tenant_phone: '07700 900123', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: day(-3) + 'T10:00:00Z', surveyed_by: 'o1', completed_in_visit: false, fault_description: 'Slipped tiles at the chimney', repair_description: 'Refix 4 tiles, new lead flashing', created_at: day(-6) + 'T09:00:00Z'},
  {id: 'dj4', org_id: O, site_id: S4, job_number: 'WO-1004', address: '9 Park Road', description: 'Ridge tile loose', job_status: 'Closed', survey_required: 'Y', survey_date: day(-8) + 'T10:00:00Z', completed_in_visit: true, works_completed: true, works_completed_date: day(-8) + 'T14:00:00Z', closed: true, variation_cost: 460, created_at: day(-10) + 'T09:00:00Z'},
  {id: 'dj5', org_id: O, site_id: S4, job_number: 'WO-1005', address: '8 Station Rd', description: 'Missing ridge tiles', job_status: 'Approved - To Do', survey_required: 'Y', survey_date: day(-5) + 'T10:00:00Z', completed_in_visit: false, variation_issued_at: day(-5) + 'T12:00:00Z', variation_cost: 300, quote_approved: true, quote_approved_at: day(-4) + 'T09:00:00Z', works_booking_date: day(2), works_booking_assigned_to: 'o1', created_at: day(-7) + 'T09:00:00Z'},
]);
db.repair_job_photos = (db.repair_job_photos || []).concat([{id: 'dph3', repair_job_id: 'dj3', category: 'survey', storage_path: 'demo/p3.jpg', uploaded_by: 'o1', deleted_at: null, created_at: now}]);
db.repair_job_notes = db.repair_job_notes || [];
db.repair_rates = (db.repair_rates || []).concat([
  {id: 'dr1', org_id: O, site_id: S4, code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45, sort: 0, category: 'Pitched Roofing', section: 'Plain Tiles'},
  {id: 'dr2', org_id: O, site_id: S4, code: 'RF205', description: 'Clear gutters', unit: 'm', rate: 3.5, sort: 1, category: 'Fascia, Soffit, Gutters', section: 'Gutters'}]);

// ---- files the demo needs ----
const OFF = path.join(APP, 'offline'); fs.mkdirSync(OFF, {recursive: true});
fs.copyFileSync(path.join(__dirname, 'fakedb.js'), path.join(OFF, 'fakedb.js'));
fs.writeFileSync(path.join(OFF, 'demo-db.js'), '// The pretend company for the offline demo (made by tools/offline/make-offline.js).\nwindow.__OPHUB_DEMO_DB = ' + JSON.stringify(db) + ';\n');
fs.copyFileSync(path.join(H, 'shots', 'samples', 'site-photo.jpg'), path.join(OFF, 'photo.jpg'));
fs.copyFileSync(path.join(H, 'shots', 'samples', 'sample.pdf'), path.join(OFF, 'sample.pdf'));
fs.writeFileSync(path.join(OFF, 'ok.json'), '{"ok":true}');
fs.copyFileSync(path.join(ROOT, 'app-native', 'assets', 'images', 'icon.png'), path.join(OFF, 'icon.png'));
fs.writeFileSync(path.join(APP, 'manifest.webmanifest'), JSON.stringify({name: 'OpHUB (Offline Demo)', short_name: 'OpHUB Demo', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#E3262B', icons: [{src: '/offline/icon.png', sizes: '1024x1024', type: 'image/png'}]}));
fs.writeFileSync(path.join(APP, 'vercel.json'), JSON.stringify({rewrites: [{source: '/(.*)', destination: '/index.html'}], headers: [{source: '/sw.js', headers: [{key: 'Cache-Control', value: 'no-cache'}]}]}, null, 1));

// ---- the page: the pretend database before the app, and the service worker ----
const idx = path.join(APP, 'index.html');
let html = fs.readFileSync(idx, 'utf8').replace(/<!--offline-->[\s\S]*?<!--\/offline-->/g, '');
const head = '<!--offline--><script src="/offline/demo-db.js"></script><script src="/offline/fakedb.js"></script>'
  + '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/offline/icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="OpHUB Demo">'
  + '<script>if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}</script><!--/offline-->';
html = html.replace(/<head>/i, '<head>' + head);
fs.writeFileSync(idx, html);

// Every file, so the phone keeps the whole app.
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push('/' + path.relative(APP, p).split(path.sep).join('/')); } })(APP);
const keep = files.filter((f) => !/^\/(sw\.js|vercel\.json)$/.test(f));
const ver = 'ophub-offline-' + Date.now();
fs.writeFileSync(path.join(APP, 'sw.js'), `// Keeps the offline demo on the phone (made by tools/offline/make-offline.js).
const V = ${JSON.stringify(ver)};
const FILES = ${JSON.stringify(keep)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // Pictures and files the page loads straight from Supabase (a logo, a photo): the demo's own copies, never the internet.
  if (/supabase\\.co$/.test(u.hostname)) {
    const own = /\\.pdf$/i.test(u.pathname) ? '/offline/sample.pdf' : /org-logos/.test(u.pathname) ? '/offline/icon.png' : '/offline/photo.jpg';
    e.respondWith(caches.match(own).then((hit) => hit || fetch(own)));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Any page of the app is the one index.html (the app finds its own screen).
  const want = e.request.mode === 'navigate' ? '/index.html' : u.pathname;
  e.respondWith(caches.match(want, {ignoreSearch: true}).then((hit) => hit || fetch(e.request)));
});
`);
const mb = files.reduce((t, f) => t + fs.statSync(path.join(APP, f)).size, 0) / 1048576;
console.log(`offline demo ready: ${files.length} files, ${mb.toFixed(1)} MB, ${db.profiles.length} people, ${db.sites.length} projects`);
