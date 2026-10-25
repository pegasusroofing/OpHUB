/* OpHUB service worker — lets the app open with no signal.

   Deliberately small and conservative:
   - The app page itself is always fetched from the network first, so a new
     release shows up immediately; the saved copy is only used when the
     network request fails (offline / no signal).
   - The logo/icons and the four CDN libraries the app loads on demand are
     served from the saved copy and refreshed in the background.
   - Nothing else is touched: every Supabase request (data, sign-in,
     uploads) goes straight to the network exactly as before. */
const CACHE = 'ophub-shell-v1';
const APP_PAGE = '/app.html';

function offlinePage(){
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>'
    + '<style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f4ef;color:#222;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;text-align:center}'
    + '@media (prefers-color-scheme:dark){body{background:#15171a;color:#eee}}button{margin-top:14px;padding:10px 18px;font-size:16px;border-radius:10px;border:0;background:#4E8FD1;color:#fff}</style></head>'
    + '<body><div><h1 style="font-size:22px;margin:0 0 8px">You\'re offline</h1><p style="margin:0">This page needs a signal to open. Check your connection and try again.</p>'
    + '<button onclick="location.reload()">Try again</button></div></body></html>';
  return new Response(html, {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}});
}
self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE).then(c=>c.add(APP_PAGE)).catch(()=>{}).then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE && k.indexOf('ophub-shell-')===0).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', event=>{
  const req = event.request;
  if(req.method !== 'GET') return;
  let url;
  try{ url = new URL(req.url); }catch(e){ return; }

  // The app page (and any other same-origin page navigation): network first,
  // saved copy only if the network fails.
  if(req.mode === 'navigate' && url.origin === self.location.origin){
    event.respondWith(
      fetch(req).then(res=>{
        if(res && res.ok && url.pathname === APP_PAGE){
          const copy = res.clone();
          caches.open(CACHE).then(c=>c.put(APP_PAGE, copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>
        // Fix round 2 (CORE-L9): only the app page falls back to its saved
        // copy. Any other page (a signing link, admin, the home page) shows a
        // plain "you're offline" page instead of the OpHUB login screen.
        url.pathname === APP_PAGE
          ? caches.match(APP_PAGE).then(hit=>hit || offlinePage())
          : caches.match(req).then(hit=>hit || offlinePage())
      )
    );
    return;
  }

  // Static images/icons from this site, and the on-demand libraries from
  // cdnjs: saved copy first, refreshed in the background.
  const isOwnStatic = url.origin === self.location.origin && /\.(png|jpe?g|svg|ico|webp|webmanifest)$/i.test(url.pathname);
  const isCdnLib = url.hostname === 'cdnjs.cloudflare.com';
  if(isOwnStatic || isCdnLib){
    event.respondWith(
      caches.open(CACHE).then(cache=>
        cache.match(req).then(hit=>{
          const refresh = fetch(req).then(res=>{
            if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(()=>{});
            return res;
          }).catch(()=>hit);
          return hit || refresh;
        })
      )
    );
  }
});
