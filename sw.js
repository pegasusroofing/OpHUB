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
        caches.match(url.pathname === APP_PAGE ? APP_PAGE : req).then(hit=>hit || caches.match(APP_PAGE))
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
