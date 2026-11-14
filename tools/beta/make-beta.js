// Finishes the web build of the new app for the private real-data link, https://ophub-beta.vercel.app (Andy, 11 Nov 2026).
//   1. cd app-native && npx expo export --platform web --output-dir <folder>
//   2. node tools/beta/make-beta.js <folder>
//   3. in <folder>: npx vercel deploy --prod --yes --scope op-hub   (Vercel project ophub-beta)
// It makes "Add To Home Screen" open full screen like an app (no Safari bars), with the OpHUB icon and name; sends every
// address to the app (so a link like /pm/hub works); and tells search engines not to list it. Safe to run twice.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) throw new Error('Give the exported folder: node tools/beta/make-beta.js <folder>');
const ROOT = path.join(__dirname, '..', '..');

fs.copyFileSync(path.join(ROOT, 'app-native', 'assets', 'images', 'icon.png'), path.join(dir, 'icon.png'));
fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify({
  name: 'OpHUB', short_name: 'OpHUB', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#ffffff', theme_color: '#ffffff',
  icons: [{src: '/icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any'}],
}, null, 1));

const head = '<!-- home screen app (make-beta.js) -->'
  + '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon.png">'
  + '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
  + '<meta name="apple-mobile-web-app-title" content="OpHUB"><meta name="apple-mobile-web-app-status-bar-style" content="default">'
  + '<meta name="theme-color" content="#ffffff">';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
if (!html.includes('make-beta.js')) html = html.replace(/<head>/i, '<head>' + head);
// Which build this is (Andy, 14 Nov 2026): Home's refresh button compares the page's stamp with /version.json and
// reloads when a newer one has gone live, so a phone left open isn't stuck on an old copy.
const build = new Date().toISOString();
const stamp = `<meta name="ophub-build" content="${build}">`;
html = /<meta name="ophub-build"[^>]*>/.test(html) ? html.replace(/<meta name="ophub-build"[^>]*>/, stamp) : html.replace(/<head>/i, '<head>' + stamp);
fs.writeFileSync(path.join(dir, 'index.html'), html);
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({build}));

// The fonts (Sora for the company name in the header, IBM Plex for the text) and a few images are exported under
// assets/node_modules/, and Vercel never uploads a folder called node_modules, so on the link they came back as the
// page instead and the header fell back to a plain font (Andy, 14 Nov 2026: "The text in the header on the link also
// isn't the correct text"). Move them to assets/pkg/ and point the app's files there.
const nmDir = path.join(dir, 'assets', 'node_modules'), pkgDir = path.join(dir, 'assets', 'pkg');
if (fs.existsSync(nmDir)) {
  fs.rmSync(pkgDir, {recursive: true, force: true});
  fs.renameSync(nmDir, pkgDir);
  const walk = (d) => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  let n = 0;
  for (const f of walk(dir).filter((f) => /\.(js|html|css|json|map)$/.test(f) && !f.startsWith(pkgDir))) {
    const s = fs.readFileSync(f, 'utf8');
    if (s.includes('/assets/node_modules/')) { fs.writeFileSync(f, s.split('/assets/node_modules/').join('/assets/pkg/')); n++; }
  }
  console.log(`fonts and images moved to assets/pkg (${n} files pointed there)`);
}

fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify({
  rewrites: [{source: '/(.*)', destination: '/index.html'}],
  headers: [
    {source: '/(.*)', headers: [{key: 'X-Robots-Tag', value: 'noindex, nofollow'}]},
    {source: '/manifest.webmanifest', headers: [{key: 'Content-Type', value: 'application/manifest+json'}]},
    {source: '/version.json', headers: [{key: 'Cache-Control', value: 'no-store'}]},
  ],
}, null, 1));
console.log('beta build ready:', dir);
