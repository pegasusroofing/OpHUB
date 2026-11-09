// Runs the OpHUB offline demo on this laptop, no internet needed: http://localhost:8099
// Started by "Start OpHUB Offline.bat". Any page that isn't a file is the app's index.html (the app finds its own screen).
const http = require('http');
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, 'app');
const PORT = 8099;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.map': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.normalize(path.join(APP, p));
  if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(APP, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`OpHUB offline demo: http://localhost:${PORT}  (leave this window open; close it to stop)`));
