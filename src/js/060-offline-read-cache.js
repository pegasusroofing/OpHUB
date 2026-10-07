/* ================= offline read cache =================
   Read-only offline support: every successful dbSelect() response is
   written through to persistent storage (the same window.storage used for
   the session — Capacitor Preferences natively, localStorage on the web),
   keyed by exactly the table+querystring that produced it. If a later call
   with that same table+querystring can't reach the network, the cached copy
   is served instead of an empty result, so whatever screens someone last
   opened while online (Home, a site's SOW, etc.) keep working with no
   signal — deliberately nothing more than that: this never queues up
   writes, so dbInsert/dbUpdate/dbDelete still just fail with a toast when
   offline, exactly as before.
   Two things keep this from ever slowing the app down: (1) the cache write
   after a successful fetch is fire-and-forget — it happens after the data
   has already been handed back to the caller, not before; (2) when the
   device is known to have no connection at all (navigator.onLine===false),
   the network attempt — which would otherwise wait out sbFetch's ~20s
   timeout (plus a retry) before failing — is skipped entirely, so a truly
   offline screen resolves from cache near-instantly instead of hanging. */
const CACHE_PREFIX = 'rtb-cache-v1:';
const CACHE_INDEX_KEY = 'rtb-cache-index-v1';
const CACHE_MAX_ENTRIES = 300; // LRU-capped so long-term use can't grow this unbounded
let cacheIndexMem = null;
// Set true by dbSelect whenever it had to fall back to a cached copy during
// the render pass currently in flight; reset per-pass at the top of
// renderRoute(). shell() reads it to show the "showing saved data" banner.
let OFFLINE_CACHE_USED = false;
async function getCacheIndex(){
  if(cacheIndexMem) return cacheIndexMem;
  const idx = await getJSON(CACHE_INDEX_KEY, false, []);
  cacheIndexMem = Array.isArray(idx) ? idx : [];
  return cacheIndexMem;
}
async function touchCacheIndex(key){
  try{
    const idx = await getCacheIndex();
    const pos = idx.indexOf(key);
    if(pos!==-1) idx.splice(pos,1);
    idx.push(key);
    const evicted = [];
    while(idx.length > CACHE_MAX_ENTRIES){ evicted.push(idx.shift()); }
    cacheIndexMem = idx;
    await setJSON(CACHE_INDEX_KEY, idx, false);
    evicted.forEach(k=>{ sdelete(CACHE_PREFIX+k, false).catch(()=>{}); });
  }catch(e){ /* best-effort — a failed cache write is never worth surfacing */ }
}
async function cacheRows(table, qs, rows){
  const key = table+'?'+qs;
  try{
    await setJSON(CACHE_PREFIX+key, {data:rows, at:Date.now()}, false);
    await touchCacheIndex(key);
  }catch(e){ /* best-effort */ }
}
async function getCachedRows(table, qs){
  try{
    const v = await getJSON(CACHE_PREFIX+(table+'?'+qs), false, null);
    return (v && Array.isArray(v.data)) ? v : null;
  }catch(e){ return null; }
}
// Wipes every cached read on sign-out — this app's device-lock model means a
// phone is usually one operative's own, but nothing here should assume that;
// a shared or handed-down device shouldn't keep showing the previous
// person's cached site data to whoever signs in next.
async function clearOfflineCache(){
  try{
    const idx = await getCacheIndex();
    for(const k of idx){ await sdelete(CACHE_PREFIX+k, false); }
    cacheIndexMem = [];
    await sdelete(CACHE_INDEX_KEY, false);
  }catch(e){ /* best-effort */ }
}
// ---- Screen re-draw memory -------------------------------------------
// Opening a dropdown, ticking a box or switching a small tab re-draws the
// screen. That re-draw used to download everything on the screen again.
// Now, while you stay on the same page, what was downloaded in the last
// 30 seconds is reused — UNLESS anything has been saved, uploaded, deleted
// or sent since (any change throws the memory away, so the next re-draw is
// always fresh), and going to a different page always starts fresh too.
const uiReadCache = {hash:null, at:0, map:new Map()};
const dbSelectOk = new WeakSet(); // answers that really came back from the server
let uiRenderDepth = 0;
const UI_READ_CACHE_MS = 30000;
function uiReadCacheClear(){ uiReadCache.map = new Map(); uiReadCache.at = 0; }
window.uiReadCacheClear = uiReadCacheClear;
function uiCloneRows(d){
  try{ return typeof structuredClone === 'function' ? structuredClone(d) : JSON.parse(JSON.stringify(d)); }
  catch(e){ return d; }
}
async function dbSelect(table, qs){
  if(uiRenderDepth <= 0 || navigator.onLine === false) return dbSelectNet(table, qs);
  const key = table+'?'+qs;
  const map = uiReadCache.map;
  let p = map.get(key);
  if(!p){
    p = dbSelectNet(table, qs);
    map.set(key, p);
    // Only a real answer from the server is remembered — a failed or
    // offline download is asked for again next time.
    p.then(d=>{ if(!d || typeof d!=='object' || !dbSelectOk.has(d)){ if(map.get(key)===p) map.delete(key); } }, ()=>{ if(map.get(key)===p) map.delete(key); });
  }
  return uiCloneRows(await p);
}
async function dbSelectNet(table, qs){
  if(navigator.onLine === false){
    const cached = await getCachedRows(table, qs);
    if(cached){ OFFLINE_CACHE_USED = true; return cached.data; }
    return [];
  }
  let res;
  try{
    res = await sbFetch('/rest/v1/'+table+'?'+qs, {method:'GET'});
  }catch(e){
    const cached = await getCachedRows(table, qs);
    if(cached){ OFFLINE_CACHE_USED = true; return cached.data; }
    toastNetworkIssue();
    return [];
  }
  if(!res.ok){ console.error(await safeErr(res)); return []; }
  const data = await res.json();
  cacheRows(table, qs, data); // fire-and-forget — see comment block above
  if(data && typeof data==='object') dbSelectOk.add(data);
  return data;
}
// Like dbSelect, but says whether the answer actually came from the server.
// dbSelect returns [] both for "no rows" and for "the request failed", which
// is fine for a list on screen but not for decisions like "this account no
// longer exists" or "replace the site list with this".
async function dbSelectChecked(table, qs){
  if(navigator.onLine === false) return {ok:false, data:[]};
  try{
    const res = await sbFetch('/rest/v1/'+table+'?'+qs, {method:'GET'});
    if(!res.ok){ console.error(await safeErr(res)); return {ok:false, data:[]}; }
    const data = await res.json();
    cacheRows(table, qs, data);
    return {ok:true, data};
  }catch(e){ return {ok:false, data:[]}; }
}
// The moment signal comes back, quietly re-render whatever's on screen so it
// swaps from cached data to live data without anyone having to pull to
// refresh themselves — only fires if something was actually shown from
// cache during the current screen's last render.
window.addEventListener('online', function(){
  uiReadCacheClear();
  if(OFFLINE_CACHE_USED) render();
});
async function dbInsert(table, rowOrRows){
  let res;
  try{
    res = await sbFetch('/rest/v1/'+table, {method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(rowOrRows)});
  }catch(e){ toast('Save failed — connection dropped. Check your signal and try again.'); return null; }
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return null; }
  const d = await res.json();
  return d;
}
async function dbUpdate(table, id, patch){
  let res;
  try{
    res = await sbFetch('/rest/v1/'+table+'?id=eq.'+id, {method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(patch)});
  }catch(e){ toast('Update failed — connection dropped. Check your signal and try again.'); return null; }
  if(!res.ok){ toast('Update failed — '+(await safeErr(res))); return null; }
  const d = await res.json();
  return Array.isArray(d)?d[0]:d;
}
async function dbDelete(table, id){
  let res;
  try{
    res = await sbFetch('/rest/v1/'+table+'?id=eq.'+id, {method:'DELETE', headers:{'Prefer':'return=representation'}});
  }catch(e){ toast('Delete failed — connection dropped. Check your signal and try again.'); return false; }
  if(!res.ok){ toast('Delete failed — '+(await safeErr(res))); return false; }
  // The database answers "OK" even when its permission rules quietly
  // removed nothing, so ask for the deleted rows back and check there
  // really was one before telling anyone it's gone.
  try{
    const gone = await res.json();
    if(Array.isArray(gone) && gone.length===0){
      toast('Nothing was deleted — you may not have permission to remove this, or it has already gone.');
      return false;
    }
  }catch(e){ /* no body returned — treat as deleted */ }
  return true;
}
async function uploadToStorage(bucket, path, blobOrFile, contentType){
  uiReadCacheClear();
  await ensureFreshToken();
  // ensureFreshToken clears SESSION when a token refresh genuinely fails
  // (expired/invalid refresh token) — reading SESSION.access_token straight
  // after that would throw a null-reference error that looked, to a user,
  // exactly like a dropped connection ("signal error") even on a perfect
  // connection. Check for it explicitly and say what's actually wrong.
  if(!SESSION || !SESSION.access_token){ toast('Your session has expired — please log out and back in, then try again.'); return null; }
  // The time allowed now grows with the size of the file: 60s minimum, plus
  // a second for every 40KB (i.e. it only gives up if the connection is
  // slower than ~40KB/s), up to 10 minutes. A flat 60s meant a 10-15MB
  // drawing on a weak site signal could never finish. One automatic retry
  // on a dropped connection, since a brief dead spot is the usual cause.
  const sizeBytes = (blobOrFile && blobOrFile.size) || 0;
  const timeoutMs = Math.min(600000, 60000 + Math.round(sizeBytes/40000)*1000);
  const attempt = ()=>fetchWithTimeout(SUPABASE_URL+'/storage/v1/object/'+bucket+'/'+path, {
    method:'POST',
    headers:{
      'apikey': SUPABASE_ANON_KEY,
      'Authorization':'Bearer '+SESSION.access_token,
      'Content-Type': contentType || blobOrFile.type || 'application/octet-stream',
      'x-upsert':'true'
    },
    body: blobOrFile
  }, timeoutMs);
  let res;
  try{
    try{ res = await attempt(); }
    catch(first){
      if(navigator.onLine === false) throw first;
      await new Promise(r=>setTimeout(r, 1500));
      res = await attempt();
    }
  }catch(e){
    const detail = (e && (e.name === 'AbortError')) ? 'the upload timed out' : ((e && e.message) || 'connection dropped');
    toast('Upload failed — '+detail+'. Please try again.');
    return null;
  }
  if(!res.ok){ toast('Upload failed — '+(await safeErr(res))); return null; }
  return path;
}
async function uploadDataUrl(bucket, path, dataUrl){
  const blob = await (await fetch(dataUrl)).blob();
  return uploadToStorage(bucket, path, blob, blob.type);
}
// Upload progress pill: every photo/file that is being prepared or sent goes
// through compressImage / uploadToStorage, so wrapping those two gives one
// "Uploading 2 of 5…" indicator on every screen without touching each form.
// Before this, a slow upload looked exactly like a frozen app.
const uploadBusy = {active:0, started:0, done:0, hideTimer:null};
function uploadBusyPaint(){
  let el = document.getElementById('uploadBusyPill');
  if(!uploadBusy.active){
    if(el && !uploadBusy.hideTimer){
      // short pause so "prepare photo" -> "send photo" doesn't flicker
      uploadBusy.hideTimer = setTimeout(()=>{
        uploadBusy.hideTimer = null;
        if(uploadBusy.active) return uploadBusyPaint();
        uploadBusy.started = 0; uploadBusy.done = 0;
        const e2 = document.getElementById('uploadBusyPill'); if(e2) e2.remove();
      }, 700);
    }
    return;
  }
  if(!el){
    if(!document.getElementById('uploadBusyStyle')){
      const st = document.createElement('style'); st.id = 'uploadBusyStyle';
      st.textContent = '@keyframes uploadBusySpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    el = document.createElement('div'); el.id = 'uploadBusyPill';
    el.setAttribute('role','status');
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:100000;background:#111;color:#fff;padding:10px 16px;border-radius:999px;font-size:13.5px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;max-width:92vw;pointer-events:none;';
    el.innerHTML = '<span style="width:16px;height:16px;flex:0 0 16px;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:uploadBusySpin .8s linear infinite;"></span><span id="uploadBusyText"></span>';
    document.body.appendChild(el);
  }
  const total = uploadBusy.started, n = Math.min(total, uploadBusy.done+1);
  const txt = document.getElementById('uploadBusyText');
  if(txt) txt.textContent = (total>1 ? 'Uploading '+n+' of '+total+'…' : 'Uploading…')+' please wait';
}
function uploadBusyTrack(promiseFn, counts){
  if(uploadBusy.quietNext) return Promise.resolve().then(promiseFn); // background tidy-up: no pill
  uploadBusy.active++; if(counts) uploadBusy.started++;
  try{ uploadBusyPaint(); }catch(e){}
  const end = ()=>{ uploadBusy.active = Math.max(0, uploadBusy.active-1); if(counts) uploadBusy.done++; try{ uploadBusyPaint(); }catch(e){} };
  let p;
  try{ p = Promise.resolve(promiseFn()); }catch(e){ end(); throw e; }
  return p.then(v=>{ end(); return v; }, e=>{ end(); throw e; });
}
{
  const rawUpload = uploadToStorage, rawCompress = compressImage;
  uploadToStorage = function(){ const a = arguments; return uploadBusyTrack(()=>rawUpload.apply(this, a), true); };
  // Preparing a photo shows the pill too, but only the send counts as "1 of N".
  compressImage = function(){ const a = arguments; return uploadBusyTrack(()=>rawCompress.apply(this, a), false); };
}
function publicUrl(bucket, path){ return path ? (SUPABASE_URL+'/storage/v1/object/public/'+bucket+'/'+path) : null; }
function blobToBase64(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
// #(share-no-file-2026-09) — sharing a Price Sheet PDF out to WhatsApp/
// email from the in-app viewer once looked completely normal (the OS share
// sheet opened, WhatsApp/Gmail were listed, no error anywhere) but the app
// that was picked received no real attachment. At the time that looked like
// the Web Share API's `files` option itself being unreliable — but the test
// that showed it had also just been changed to upload the file to storage
// *before* calling share(), and on iOS Safari any await between a tap and
// the actual share call breaks the browser's requirement that the call
// happen synchronously within that tap's own gesture; it fails silently
// rather than throwing. That upload delay, not the files API itself, was
// the likely real cause — so files-mode sharing is back as the primary
// path here, called with nothing awaited beforehand (see
// #(share-call-must-be-immediate) in sharePdfViewerDoc). On native
// platforms this instead writes the file to a real path on disk via the
// Capacitor Filesystem plugin and shares that as a real content://file://
// URI via the Capacitor Share plugin — belt-and-braces, since that path
// doesn't depend on the Web Share API at all once those plugins are
// actually linked into the build.
// Returns a status string rather than a boolean so the caller can tell a
// real failure apart from "nothing to try" and from the user just backing
// out of the share sheet — see #(share-status-not-boolean) in
// sharePdfViewerDoc for why that distinction matters:
//   'shared'      — handed off successfully (native plugin, or Web Share files)
//   'cancelled'   — the user dismissed the share sheet themselves; not an error
//   'failed'      — files sharing was available and attempted but errored
//   'unsupported' — no files-capable share path exists on this browser/app at all
// Set whenever shareFile returns 'failed', so the caller can show the real
// native error instead of a generic "didn't work" toast — useful now that
// the web path below no longer tries (and silently eats failures from) the
// browser's own Web Share files API at all; see sharePdfViewerDoc.
let lastShareErrorDetail = null;
async function shareFile(blob, filename, mimeType){
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  if(isNative && plugins && plugins.Filesystem && plugins.Share){
    try{
      const base64 = await blobToBase64(blob);
      const written = await plugins.Filesystem.writeFile({path: filename, data: base64, directory: 'CACHE'});
      await plugins.Share.share({title: filename, url: written.uri});
      return 'shared';
    }catch(e){
      console.error('[shareFile:native]', e);
      lastShareErrorDetail = (e && e.message) || String(e) || null;
      return (e && e.message==='canceled') ? 'cancelled' : 'failed';
    }
  }
  // Not the native app. Web Share's `files` option is the only mechanism
  // that shares without navigating away from this page at all — Andy wants
  // that over anything that leaves the page, even knowing this specific API
  // has previously handed WhatsApp a 0-byte file on his iPhone (a WebKit
  // bug, not something fixable here) — see #(share-2026-09-30-c) in
  // sharePdfViewerDoc.
  const file = new File([blob], filename, {type: mimeType});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      // #(files-share-no-title): passing `title` alongside `files` is what
      // repeatedly, independently gets reported elsewhere as a cause of iOS
      // Safari dropping the real file for some share targets — keeping this
      // call to files-only is a known, if unofficial, mitigation.
      await navigator.share({files:[file]});
      return 'shared';
    }catch(e){
      console.error('[shareFile:web]', e);
      lastShareErrorDetail = (e && e.message) || null;
      return (e && e.name==='AbortError') ? 'cancelled' : 'failed';
    }
  }
  return 'unsupported';
}
// Shared PDF delivery for every generated export (reports, RAMS, toolbox talks,
// snagging, schedule of works). Used to hand this off to whatever PDF viewer
// the platform provided (Safari, Android Chrome/Custom Tabs, a plain browser
// tab) and rely on a Content-Disposition filename hint to get the right name
// to show — that never worked consistently everywhere (see viewPdfInApp's
// comment above for the full story; short version: Android Chrome silently
// download the file instead of showing it, if the same hint that made
// Safari's title correct was present). Now this just hands the bytes we
// already have straight to our own in-app viewer — no upload, no network
// round trip, no platform guessing, and the name is always right because
// it's our own header bar showing it, on every platform, every time.
async function deliverPdf(bytes, filename, opts){
  await viewPdfInApp(bytes, filename, Object.assign({canSync:true}, opts||{}));
}
// ☁️ button in the PDF viewer: saves the PDF on screen into OneDrive. A PDF
// exported from inside a project goes to that project's OneDrive folder; a
// company-wide one (training matrix, delivery schedule…) goes into a
// "Company Exports" folder in the company's main OpHUB folder.
let pdfViewerSyncBusy = false;
window.syncPdfViewerDoc = async function(){
  const st = pdfViewerState;
  if(!st || pdfViewerSyncBusy) return;
  if(!st.bytes){ toast('Still preparing this file — try again in a moment.'); return; }
  const m = /^#\/site\/([^\/?]+)/.exec(location.hash||'');
  const siteId = st.siteId || (m ? m[1] : null);
  const site = siteId ? SITES.find(x=>x.id===siteId) : null;
  const btn = document.getElementById('pdfViewerSyncBtn');
  pdfViewerSyncBusy = true;
  if(btn){ btn.textContent = '⏳'; btn.style.opacity = '.6'; }
  toast('Saving to OneDrive…');
  try{
    const base64 = await blobToBase64(new Blob([st.bytes], {type:'application/pdf'}));
    const payload = {filename: st.filename, content_base64: base64};
    if(site) payload.site_id = site.id; else payload.subfolder = 'Company Exports';
    const res = await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify(payload)});
    let out = null; try{ out = await res.json(); }catch(e){}
    if(res.ok && out && out.ok){
      toast('Saved to OneDrive — '+(site ? site.name : 'Company Exports')+' folder');
      if(btn && pdfViewerState===st) btn.textContent = '✅';
    } else if(out && out.error==='not_connected'){
      toast('OneDrive isn\'t connected yet — connect it in Settings first.');
      if(btn) btn.textContent = '☁️';
    } else {
      toast('Could not save to OneDrive — '+((out && out.error) || res.status));
      if(btn) btn.textContent = '☁️';
    }
  }catch(e){
    console.error('[syncPdfViewerDoc]', e);
    toast('Could not save to OneDrive — '+((e && e.message) || 'check your connection and try again'));
    if(btn) btn.textContent = '☁️';
  }
  pdfViewerSyncBusy = false;
  if(btn) btn.style.opacity = '';
};
window.emailPdfViewerDoc = function(){
  if(pdfViewerState && pdfViewerState.emailAction) pdfViewerState.emailAction();
};
// Same problem as deliverPdf above (a plain download link does nothing inside
// the native app) but for Excel exports. There's no in-app spreadsheet
// viewer, so on native this uploads the file and hands it to the system —
// tapping it opens iOS's own document preview, from where it can be saved
// or shared like any other file.
async function deliverExcelFile(wb, filename){
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if(isNative){
    toast('Opening file…');
    try{
      const out = XLSX.write(wb, {type:'array', bookType:'xlsx'});
      const blob = new Blob([out], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const safeName = filename.replace(/[^a-z0-9.\-]+/gi,'-');
      const path = 'exports/'+uid()+'-'+safeName;
      const stored = await uploadToStorage('site-photos', path, blob, blob.type);
      if(stored && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser){
        await window.Capacitor.Plugins.Browser.open({url: publicUrl('site-photos', stored)+'?download='+encodeURIComponent(filename)});
        return;
      }
    }catch(e){ /* fall through to the direct-download fallback below */ }
  }
  XLSX.writeFile(wb, filename);
  toast('Excel file downloaded');
}
// Same idea as deliverExcelFile, but for an ExcelJS-built workbook buffer
// (used by the branded exports that embed the company logo — ExcelJS is the
// only one of the two spreadsheet libraries that can do that) rather than a
// SheetJS/XLSX workbook object.
async function deliverExcelBuffer(buffer, filename){
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if(isNative){
    toast('Opening file…');
    try{
      const safeName = filename.replace(/[^a-z0-9.\-]+/gi,'-');
      const path = 'exports/'+uid()+'-'+safeName;
      const stored = await uploadToStorage('site-photos', path, blob, blob.type);
      if(stored && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser){
        await window.Capacitor.Plugins.Browser.open({url: publicUrl('site-photos', stored)+'?download='+encodeURIComponent(filename)});
        return;
      }
    }catch(e){ /* fall through to the direct-download fallback below */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Excel file downloaded');
}
// Same "deliver a file" problem as deliverPdf/deliverExcelFile, for a .ics
// calendar file — iPhone (Apple Calendar) and Android (Google Calendar etc.)
// both know how to import a standard .ics when it's opened, so a single
// export works for both without needing separate native calendar APIs.
async function deliverIcsFile(icsText, filename){
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const blob = new Blob([icsText], {type:'text/calendar;charset=utf-8'});
  if(isNative){
    toast('Opening calendar file…');
    try{
      const safeName = filename.replace(/[^a-z0-9.\-]+/gi,'-');
      const path = 'exports/'+uid()+'-'+safeName;
      const stored = await uploadToStorage('site-photos', path, blob, 'text/calendar');
      if(stored){
        // #(ics-in-app-browser-fix): a .ics only gets iOS's native "Add to
        // Calendar" import prompt when the OS's own Safari opens it — inside
        // Capacitor's in-app Browser plugin (an embedded view, not real
        // Safari) iOS just displays or silently drops the raw file instead,
        // which looked to the user like "nothing happens"/an error and
        // never actually saved anything to their calendar. window.open with
        // the '_system' target is what Capacitor recognises as "hand this
        // off to the real system browser" instead of opening its own view,
        // which is what lets iOS's Calendar-import handoff actually fire.
        window.open(publicUrl('site-photos', stored), '_system');
        return;
      }
    }catch(e){ /* fall through to the direct-download fallback below */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Calendar file downloaded — open it to add these to your phone calendar');
}
function icsEscapeText(s){
  return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function icsDateStamp(d){
  return d.getUTCFullYear() + String(d.getUTCMonth()+1).padStart(2,'0') + String(d.getUTCDate()).padStart(2,'0') + 'T' + String(d.getUTCHours()).padStart(2,'0') + String(d.getUTCMinutes()).padStart(2,'0') + String(d.getUTCSeconds()).padStart(2,'0') + 'Z';
}
// Builds a standard all-day-event .ics calendar from site_calendar_events
// rows (title + event_date only — no time field on these key dates).
function buildCalendarIcs(events, calName){
  const now = icsDateStamp(new Date());
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OpHUB//Site Calendar//EN','CALSCALE:GREGORIAN'];
  events.forEach(e=>{
    const dateCompact = String(e.event_date).replace(/-/g,'');
    // All-day events: DTEND is exclusive per RFC5545, so it's the day after.
    const endD = new Date(e.event_date+'T00:00:00'); endD.setDate(endD.getDate()+1);
    const endCompact = endD.getFullYear() + String(endD.getMonth()+1).padStart(2,'0') + String(endD.getDate()).padStart(2,'0');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:'+e.id+'@ophub.app');
    lines.push('DTSTAMP:'+now);
    lines.push('DTSTART;VALUE=DATE:'+dateCompact);
    lines.push('DTEND;VALUE=DATE:'+endCompact);
    lines.push('SUMMARY:'+icsEscapeText(e.title||'Key date'));
    if(calName) lines.push('LOCATION:'+icsEscapeText(calName));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
window.exportSiteCalendarIcs = async function(siteId){
  const site = SITES.find(s=>s.id===siteId);
  toast('Building calendar file…');
  try{
    const todayStr = localISODate(new Date());
    const events = await dbSelect('site_calendar_events', 'site_id=eq.'+siteId+'&event_date=gte.'+todayStr+'&order=event_date.asc');
    if(!events.length){ toast('No upcoming key dates to export.'); return; }
    const ics = buildCalendarIcs(events, site?site.name:'');
    const filename = exportFilename(site?site.name:'', 'Key Dates', 'ics');
    await deliverIcsFile(ics, filename);
  }catch(e){
    console.error(e);
    toast('Could not build the calendar file — please try again.');
  }
};
