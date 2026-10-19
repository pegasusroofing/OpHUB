/* ================= #(private-files) Private file storage =================
   2026-10-19 (Andy): files (signatures, induction PDFs with health answers,
   receipts, site photos, RAMS/COSHH, drawings…) move from "anyone with the
   link can open it" to private storage. Every file is then opened with a
   short-lived signed link that only works for a signed-in member of the
   company (7 days, refreshed automatically).

   The rest of the app keeps calling publicUrl(bucket, path) exactly as
   before. This file makes those addresses work when the bucket is private:
   - <img>, <a>, onclick="…" and style="…" on the page are swapped to signed
     links as they appear (MutationObserver);
   - fetch(), new Image().src, window.open, the PDF/image viewers and
     "open in browser" all resolve the address first;
   - links are signed in batches (one request per bucket) and remembered on
     the phone, so the same photo keeps the same link (and stays in the
     phone's picture cache) for days.
   It works the same while the buckets are still public, so this can ship
   before the switch. */
const PRIVATE_BUCKETS = new Set(['mc-documents','signatures','site-photos','incident-photos','rams-docs','coshh-docs','coshh-library','drawings','operative-tools','finance-docs']);
const STORAGE_PUBLIC_PREFIX = SUPABASE_URL+'/storage/v1/object/public/';
const SIGNED_TTL_S = 7*24*3600;          // how long a signed link lasts
const SIGNED_MIN_LEFT_MS = 24*3600*1000; // re-sign when less than this is left
const SIGNED_LS_KEY = 'ophub_signed_v1';
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let SIGNED = {};
try{ SIGNED = JSON.parse(localStorage.getItem(SIGNED_LS_KEY)||'{}') || {}; }catch(e){ SIGNED = {}; }
let signedSaveTimer = null;
function signedSave(){
  if(signedSaveTimer) return;
  signedSaveTimer = setTimeout(()=>{
    signedSaveTimer = null;
    try{
      const now = Date.now(); const keys = Object.keys(SIGNED);
      keys.forEach(k=>{ if(!SIGNED[k] || SIGNED[k].e < now) delete SIGNED[k]; });
      const left = Object.keys(SIGNED);
      if(left.length > 4000) left.sort((a,b)=>SIGNED[a].e-SIGNED[b].e).slice(0, left.length-4000).forEach(k=>delete SIGNED[k]);
      localStorage.setItem(SIGNED_LS_KEY, JSON.stringify(SIGNED));
    }catch(e){}
  }, 400);
}
function signedCacheClear(){ SIGNED = {}; try{ localStorage.removeItem(SIGNED_LS_KEY); }catch(e){} }
// "…/object/public/<private bucket>/<path>?extra" → {bucket, path, query, key}
function storageParse(u){
  if(typeof u !== 'string' || u.indexOf(STORAGE_PUBLIC_PREFIX) !== 0) return null;
  const rest = u.slice(STORAGE_PUBLIC_PREFIX.length);
  const qi = rest.indexOf('?'), hi = rest.indexOf('#');
  const end = qi > -1 ? qi : (hi > -1 ? hi : rest.length);
  const main = rest.slice(0, end);
  const query = qi > -1 ? rest.slice(qi+1).split('#')[0] : '';
  const si = main.indexOf('/');
  if(si < 1) return null;
  const bucket = main.slice(0, si);
  if(!PRIVATE_BUCKETS.has(bucket)) return null;
  let path = main.slice(si+1);
  try{ path = decodeURIComponent(path); }catch(e){}
  return {bucket, path, query, key: bucket+'/'+path};
}
function signedFor(p){
  const c = SIGNED[p.key];
  if(!c || c.e - Date.now() < SIGNED_MIN_LEFT_MS) return null;
  let u = c.u;
  if(p.query){
    const extra = p.query.split('&').filter(x=>x && !/^token=/.test(x));
    if(extra.length) u += '&' + extra.join('&');
  }
  return u;
}
// The address to actually use, if we already have it (else null while it's signed).
function resolveStorageUrlSync(u){ const p = storageParse(u); if(!p) return u; return signedFor(p); }
let signQueue = new Map(); // key -> {bucket, path, waiters:[]}
let signFlushTimer = null;
const signFailedAt = {};   // key -> time of last failure (don't hammer)
let _origFetch = window.fetch.bind(window);
function queueSign(p){
  return new Promise(resolve=>{
    if(signFailedAt[p.key] && Date.now()-signFailedAt[p.key] < 60000){ resolve(); return; }
    let q = signQueue.get(p.key);
    if(!q){ q = {bucket:p.bucket, path:p.path, waiters:[]}; signQueue.set(p.key, q); }
    q.waiters.push(resolve);
    if(!signFlushTimer) signFlushTimer = setTimeout(flushSignQueue, 30);
  });
}
async function flushSignQueue(){
  signFlushTimer = null;
  const batch = Array.from(signQueue.values()); signQueue = new Map();
  if(!batch.length) return;
  const byBucket = {};
  batch.forEach(it=>{ (byBucket[it.bucket] = byBucket[it.bucket] || []).push(it); });
  try{ await ensureFreshToken(); }catch(e){}
  const token = SESSION && SESSION.access_token;
  await Promise.all(Object.keys(byBucket).map(async bucket=>{
    const items = byBucket[bucket];
    for(let i=0; i<items.length; i+=200){
      const chunk = items.slice(i, i+200);
      try{
        if(!token) throw new Error('signed out');
        const send = ()=>_origFetch(SUPABASE_URL+'/storage/v1/object/sign/'+bucket, {
          method:'POST',
          headers:{'apikey':SUPABASE_ANON_KEY, 'Authorization':'Bearer '+token, 'Content-Type':'application/json'},
          body: JSON.stringify({expiresIn: SIGNED_TTL_S, paths: chunk.map(c=>c.path)}),
        });
        let res = await send();
        // Busy (too many requests): wait a moment and try again, twice.
        for(let t=1; t<=2 && (res.status===429 || res.status>=500); t++){ await new Promise(r=>setTimeout(r, 1500*t)); res = await send(); }
        const rows = res.ok ? await res.json() : [];
        const exp = Date.now() + SIGNED_TTL_S*1000 - 60000;
        const got = new Set();
        (Array.isArray(rows) ? rows : []).forEach(r=>{
          const s = r && (r.signedURL || r.signedUrl);
          if(s && r.path && !r.error){
            SIGNED[bucket+'/'+r.path] = {u: s.indexOf('http')===0 ? s : SUPABASE_URL+'/storage/v1'+(s.charAt(0)==='/'?'':'/')+s, e: exp};
            got.add(r.path);
          }
        });
        chunk.forEach(c=>{ if(!got.has(c.path)) signFailedAt[bucket+'/'+c.path] = Date.now(); });
      }catch(e){ chunk.forEach(c=>{ signFailedAt[bucket+'/'+c.path] = Date.now(); }); }
      chunk.forEach(c=>c.waiters.forEach(w=>{ try{ w(); }catch(e){} }));
    }
  }));
  signedSave();
}
// Always resolves: the signed link, or the original address if it can't be signed.
async function resolveStorageUrl(u){
  const p = storageParse(u);
  if(!p) return u;
  const s = signedFor(p); if(s) return s;
  await queueSign(p);
  return signedFor(p) || u;
}
window.resolveStorageUrl = resolveStorageUrl;
// Sign a whole list in one go (one request per bucket) before code fetches
// them one by one — e.g. the photos for a PDF. Without this, each photo was
// signed on its own and a 200-photo report hit the server's rate limit.
async function presignStorageUrls(urls){
  const want = [];
  (urls||[]).forEach(u=>{ const p = storageParse(String(u||'')); if(p && !signedFor(p)) want.push(p); });
  if(!want.length) return;
  await Promise.all(want.map(p=>queueSign(p)));
}
window.presignStorageUrls = presignStorageUrls;

// ---- fetch(): resolve before sending ----
window.fetch = function(input, init){
  if(typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)){
    const s = String(input);
    if(storageParse(s)) return resolveStorageUrl(s).then(u=>_origFetch(u, init));
  }
  return _origFetch(input, init);
};

// ---- new Image().src = … / img.src = … in code ----
try{
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if(srcDesc && srcDesc.set){
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, enumerable: srcDesc.enumerable,
      get(){ return srcDesc.get.call(this); },
      set(v){
        const s = String(v); const p = storageParse(s);
        if(!p){ this.__ophubWant = null; return srcDesc.set.call(this, v); }
        const r = signedFor(p);
        if(r){ this.__ophubWant = null; return srcDesc.set.call(this, r); }
        // Don't load the old address (it would fail and fire onerror) —
        // wait for the signed one, then load that.
        this.__ophubWant = s;
        resolveStorageUrl(s).then(u=>{ if(this.__ophubWant === s){ this.__ophubWant = null; srcDesc.set.call(this, u); } });
      },
    });
  }
}catch(e){}

// ---- window.open / opening in the browser ----
const _origOpen = window.open ? window.open.bind(window) : null;
if(_origOpen){
  window.open = function(url){
    const rest = Array.prototype.slice.call(arguments, 1);
    const s = String(url||''); const p = storageParse(s);
    if(!p) return _origOpen.apply(window, arguments);
    const r = signedFor(p);
    if(r) return _origOpen.apply(window, [r].concat(rest));
    const w = _origOpen.apply(window, ['about:blank'].concat(rest)); // opened now so it isn't blocked
    resolveStorageUrl(s).then(u=>{ try{ if(w) w.location.href = u; else location.href = u; }catch(e){ location.href = u; } });
    return w;
  };
}

// ---- links, pictures and buttons already on the page ----
const STORAGE_URL_RE = new RegExp(STORAGE_PUBLIC_PREFIX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[^\'"\\s)<>]+', 'g');
const STORAGE_ATTRS = ['src','href','onclick','style','data-src','data-full'];
function fixStorageEl(el){
  if(!el || el.nodeType !== 1) return;
  for(const a of STORAGE_ATTRS){
    const v = el.getAttribute(a);
    if(!v || v.indexOf(STORAGE_PUBLIC_PREFIX) === -1) continue;
    if(a === 'src' || a === 'href' || a === 'data-src' || a === 'data-full'){
      const p = storageParse(v); if(!p) continue;
      const r = signedFor(p);
      if(r){ el.setAttribute(a, r); continue; }
      if(a === 'src' && (el.tagName === 'IMG' || el.tagName === 'IFRAME')){
        el.setAttribute('data-ophub-src', v);
        el.setAttribute('src', el.tagName === 'IMG' ? BLANK_GIF : 'about:blank');
      }
      resolveStorageUrl(v).then(u=>{
        if(u === v) return; // couldn't sign — leave as it was
        if(a === 'src' && el.getAttribute('data-ophub-src') === v){ el.removeAttribute('data-ophub-src'); el.setAttribute('src', u); }
        else if(el.getAttribute(a) === v) el.setAttribute(a, u);
      });
    } else {
      // onclick="viewImage('…')", style="background-image:url(…)": swap every address inside
      const found = v.match(STORAGE_URL_RE) || [];
      let out = v, pending = [];
      found.forEach(f=>{ const p = storageParse(f); if(!p) return; const r = signedFor(p); if(r) out = out.split(f).join(r); else pending.push(f); });
      if(out !== v) el.setAttribute(a, out);
      if(pending.length) Promise.all(pending.map(f=>resolveStorageUrl(f).then(u=>[f,u]))).then(pairs=>{
        let cur = el.getAttribute(a); if(!cur) return;
        pairs.forEach(([f,u])=>{ if(u !== f) cur = cur.split(f).join(u); });
        if(cur !== el.getAttribute(a)) el.setAttribute(a, cur);
      });
    }
  }
}
const STORAGE_SEL = STORAGE_ATTRS.map(a=>'['+a+'*="/object/public/"]').join(',');
function fixStorageTree(root){
  if(!root || root.nodeType !== 1) return;
  fixStorageEl(root);
  if(root.querySelectorAll) root.querySelectorAll(STORAGE_SEL).forEach(fixStorageEl);
}
try{
  new MutationObserver(muts=>{
    for(const m of muts){
      if(m.type === 'childList') m.addedNodes.forEach(n=>{ if(n.nodeType === 1) fixStorageTree(n); });
      else if(m.type === 'attributes') fixStorageEl(m.target);
    }
  }).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:STORAGE_ATTRS});
}catch(e){}
document.addEventListener('DOMContentLoaded', ()=>fixStorageTree(document.body));
// A link tapped before its signed address arrived: open it once it has.
document.addEventListener('click', e=>{
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if(!a) return;
  const h = a.getAttribute('href');
  if(!storageParse(h)) return;
  e.preventDefault();
  resolveStorageUrl(h).then(u=>openExternalFile(u));
}, true);
// ---- the viewers: resolve the address before opening ----
(function(){
  const vi = window.viewImage;
  if(typeof vi === 'function') window.viewImage = function(url){ const a = arguments; if(typeof url==='string' && storageParse(url)){ const r = resolveStorageUrlSync(url); if(r) return vi.apply(this, [r].concat([].slice.call(a,1))); return resolveStorageUrl(url).then(u=>vi.apply(this, [u].concat([].slice.call(a,1)))); } return vi.apply(this, a); };
  const vp = window.viewPdfInApp;
  if(typeof vp === 'function') window.viewPdfInApp = async function(source){ const a = [].slice.call(arguments); if(typeof source==='string') a[0] = await resolveStorageUrl(source); return vp.apply(this, a); };
  const oe = openExternalFile;
  openExternalFile = async function(url){ return oe(await resolveStorageUrl(String(url||''))); };
})();
// Capacitor in-app browser (download / open buttons on the phone app).
async function openInAppBrowser(url){ const u = await resolveStorageUrl(url); return window.Capacitor.Plugins.Browser.open({url: u}); }
