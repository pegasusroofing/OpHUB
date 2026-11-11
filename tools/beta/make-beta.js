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
fs.writeFileSync(path.join(dir, 'index.html'), html);

fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify({
  rewrites: [{source: '/(.*)', destination: '/index.html'}],
  headers: [
    {source: '/(.*)', headers: [{key: 'X-Robots-Tag', value: 'noindex, nofollow'}]},
    {source: '/manifest.webmanifest', headers: [{key: 'Content-Type', value: 'application/manifest+json'}]},
  ],
}, null, 1));
console.log('beta build ready:', dir);
