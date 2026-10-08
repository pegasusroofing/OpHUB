/* ================= generic helpers ================= */
function uid(){ return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,9); }
// Small, fast string hash (djb2) — used to fold the fingerprint's raw
// signal string down into a short, stable, URL-safe id.
function _hashStr(str){
  let h = 5381;
  for(let i=0;i<str.length;i++){ h = ((h*33) ^ str.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}
// A canvas-rendering fingerprint. Text/shape anti-aliasing, font hinting and
// GPU/driver rasterisation differ enough between distinct physical devices
// (and are consistent for the SAME device every time) that the resulting
// pixel data — reduced to a hash — acts as a stable per-hardware signal that
// survives clearing site data or opening a private/incognito window, unlike
// localStorage.
function _canvasFingerprint(){
  try{
    const c = document.createElement('canvas');
    c.width = 220; c.height = 40;
    const ctx = c.getContext('2d');
    if(!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0,0,220,40);
    ctx.fillStyle = '#069';
    ctx.fillText('OpHUB device check 🔧', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('OpHUB device check 🔧', 4, 17);
    return c.toDataURL();
  }catch(e){ return ''; }
}
// A per-DEVICE identifier derived from stable hardware/rendering
// characteristics (screen size/depth, CPU core count, timezone, platform,
// user-agent and a canvas rendering fingerprint), not from anything stored
// in the browser. This means the SAME physical phone produces the SAME
// device id even from a brand-new private/incognito window (which wipes
// localStorage) — closing the one-device-per-operative loophole where
// incognito mode used to look like a fresh, unlocked device every time.
// It's cached in localStorage purely as a fast-path (avoids recomputing the
// canvas fingerprint on every call); if that cache is missing or was wiped,
// it's simply recomputed — and comes back to the SAME id, unlike the old
// random-id scheme.
function getDeviceId(){
  let cached = null;
  try{ cached = localStorage.getItem('ophub_device_id'); }catch(e){ /* private browsing etc — non-fatal */ }
  // Anything already saved on this phone is kept, so nobody's existing lock changes.
  if(cached && /^(fp_|dv_)/.test(cached)) return cached;
  // New installs get an id that is unique to this browser/app on this phone,
  // so two people with the same model of phone can never be mistaken for the
  // same device. Recognising "the same handset opened another way" (Safari
  // vs the app, or a private window) is the job of getHardwareId() below.
  let id = null;
  try{ id = 'dv_'+(crypto.randomUUID ? crypto.randomUUID() : (_hashStr(String(Math.random())+Date.now())+_hashStr(String(Math.random())))); }catch(e){ id = null; }
  if(id){
    try{ localStorage.setItem('ophub_device_id', id); if(localStorage.getItem('ophub_device_id')===id) return id; }catch(e){ /* storage blocked — fall through */ }
  }
  // Storage isn't available (e.g. some private windows): fall back to the
  // old signature-based id so the phone still gets the same id every time.
  const signal = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    screen.width+'x'+screen.height+'x'+screen.colorDepth,
    navigator.hardwareConcurrency || '',
    (new Date()).getTimezoneOffset(),
    _canvasFingerprint()
  ].join('||');
  return 'fp_'+_hashStr(signal);
}
// What this handset "looks like" — deliberately built only from things that
// are the SAME in Safari and inside the phone app (screen, pixel density,
// processor count, touch points, language, timezone), and nothing that
// differs between them (the browser's own name/version). The server uses it
// to spot the same phone being used a second way; because two phones of the
// same model also look alike, a match is held for approval, never refused.
function getHardwareId(){
  try{
    const w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height);
    const signal = [
      w+'x'+h+'x'+screen.colorDepth,
      window.devicePixelRatio || '',
      navigator.hardwareConcurrency || '',
      navigator.maxTouchPoints || 0,
      navigator.platform || '',
      navigator.language || '',
      (new Date()).getTimezoneOffset(),
    ].join('||');
    return 'hw_'+_hashStr(signal);
  }catch(e){ return null; }
}
// Who the one-phone rule applies to: everyone except project managers,
// company admins and the super admin.
function deviceLockApplies(profile){
  return !!profile && ['pm','admin','superadmin'].indexOf(profile.role) === -1;
}
function deviceLockMessage(lock){
  return lock.error==='device_locked'
    ? `This phone is already signed in to OpHUB as ${lock.locked_to_name || 'another team member'}. Each phone can only be used by one person — ask your Project Manager or admin to unlock it in Admin Centre if this is wrong.`
    : lock.error==='pending_approval'
    ? (lock.reason==='lookalike'
        ? `This phone needs approving before you can sign in on it. Ask your Project Manager or admin to approve it in Admin Centre › Device Locks, then sign in again.`
        : `This is a new device for your account. Ask your Project Manager or admin to approve it in Admin Centre › Device Locks, then try signing in again.`)
    : 'Could not verify this device — check your connection and try again.';
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Shared "CC client contact" tick box, dropped into every "email this"
// picker in the app except Material and Price (those stay internal-only).
// Renders nothing if the site has no client_email on file yet, so a site
// with no Client Info entered just doesn't show the option. Each picker
// gives its own inputId (must be unique per picker, since more than one can
// theoretically be open... in practice only one modal is ever open at once,
// but keeping them distinct avoids any cross-talk if that ever changes).
function ccClientTickHtml(site, inputId){
  if(!site || !site.client_email) return '';
  return `<label style="display:flex;align-items:center;gap:8px;padding:8px 2px;font-size:12.5px;font-weight:600;cursor:pointer;">
    <input type="checkbox" id="${inputId}" style="width:auto;">CC client contact${(site.client_contact_name||site.client_name)?' ('+escapeHtml(site.client_contact_name||site.client_name)+')':''}
  </label>`;
}
// Reads back an inputId written by ccClientTickHtml — returns the site's
// client_email if ticked, else null. Safe to call even when the checkbox
// wasn't rendered (no client_email) since the element just won't exist.
function ccClientEmailIfTicked(site, inputId){
  const el = document.getElementById(inputId);
  return (el && el.checked && site && site.client_email) ? site.client_email : null;
}
// Timezone-safe "YYYY-MM-DD" for a local Date — NOT the same as
// d.toISOString().slice(0,10), which converts to UTC first and so silently
// shifts the date back a day for any UTC+ timezone (e.g. British Summer
// Time) once local midnight is past 11pm the previous UTC day. Use this
// anywhere a calendar day/date-only key needs deriving from a local Date.
function localISODate(d){
  const y = d.getFullYear(), m = d.getMonth()+1, day = d.getDate();
  return y+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
// Makes an entire date-selection row open the native date picker, not just
// the small calendar glyph inside the <input type="date"> itself (#288).
// Pass the row element (its onclick target) — finds the first date input
// inside it and opens it. Safe to call even if the click originated on the
// input itself (double-open is a no-op in every browser that supports
// showPicker); falls back to focusing the input on older WebViews.
window.openDatePickerRow = function(rowEl){
  const input = rowEl && (rowEl.matches && rowEl.matches('input[type="date"]') ? rowEl : rowEl.querySelector('input[type="date"]'));
  if(!input || input.disabled) return;
  if(input.showPicker){ try{ input.showPicker(); }catch(e){ input.focus(); } }
  else { input.focus(); }
};
// Live-formats a text input as the user types: capitalises the first letter
// of every word (leaves the rest of each word's casing alone so acronyms
// etc aren't mangled) — used on site name/address fields. Cursor position is
// preserved since the transform never changes the string's length.
function applyTitleCase(el){
  const pos = el.selectionStart;
  el.value = el.value.replace(/(^|\s)([a-z])/g, (m,p1,p2)=>p1+p2.toUpperCase());
  try{ el.setSelectionRange(pos,pos); }catch(e){}
}
// Live-uppercases a text input as the user types (digits/spaces pass
// through untouched) — used on postcode fields.
function applyUpperCase(el){
  const pos = el.selectionStart;
  el.value = el.value.toUpperCase();
  try{ el.setSelectionRange(pos,pos); }catch(e){}
}
// Consistent, readable export filenames across every PDF/Excel export:
// "Site Name - Export Name - DD-MM-YY.ext" (a literal "/" isn't allowed in
// filenames on iOS/Mac/Windows, so the date uses dashes instead of slashes).
function exportFilename(siteName, label, ext){
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(-2);
  const parts = [siteName, label, dd+'-'+mm+'-'+yy].filter(Boolean);
  const name = parts.join(' - ').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();
  return name + '.' + ext;
}
// For values dropped into an onclick="fn('...')" attribute: escape backslash
// and single-quote for JS FIRST, then HTML-escape the result for the
// attribute. Doing it the other way round (HTML-escape, then try to
// backslash-escape quotes) is a no-op, because escapeHtml already turned
// every ' into &#39; — leaving nothing left to backslash-escape. The
// browser decodes &#39; back to a literal ' before parsing the onclick JS,
// so any name containing an apostrophe (e.g. "Andy's Documents") silently
// broke the click handler with no error shown — it just did nothing.
function jsAttr(s){ return escapeHtml(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }
// A JS literal for embedding inside a double-quoted onclick="..." attribute —
// booleans stay bare (true/false), everything else becomes a single-quoted,
// escaped string. Used for the media-required value toggles below.
function jsLit(o){ return typeof o==='boolean' ? String(o) : `'${String(o).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`; }
function toast(msg){
  const host=document.getElementById('toastHost');
  const el=document.createElement('div'); el.className='toast';
  // #(toast-xss-fix): msg can trace back to another user's self-chosen
  // display name or org name (e.g. "X removed"/"X deleted" toasts built
  // from a profile/org name) — escape it before insertion via innerHTML,
  // same as customConfirm/customAlert already do, so a malicious name
  // can't execute script in the admin's session who acts on it.
  el.innerHTML='<div class="stripe"></div><div>'+escapeHtml(msg)+'</div>';
  host.innerHTML=''; host.appendChild(el);
  setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); },3200);
}
// App-wide safety net (app speed/reliability pass). render() already catches
// anything thrown while a page is drawing and shows a recoverable screen —
// but a stray onclick handler that throws (or rejects) BEFORE it gets to
// call render() previously failed completely silently: the tap looked like
// it did nothing, with no error and no feedback anywhere. dbSelect/dbInsert/
// dbUpdate/dbDelete already catch their own network failures and toast a
// specific message, so this only ever fires for a genuine bug slipping past
// every other safeguard — it logs it for diagnosis and lets the person know
// to try again, instead of the tap just going nowhere.
window.addEventListener('error', function(e){
  console.error('Unhandled error', e && (e.error || e.message));
});
window.addEventListener('unhandledrejection', function(e){
  console.error('Unhandled rejection', e && e.reason);
  try{ toast('Something went wrong — please try that again.'); }catch(_e){}
});
// Image viewer with pinch-zoom/pan/double-tap — the underlying file was
// already full quality (uploads are never downscaled for Drawings), the
// complaint was really "I can't zoom in to read the detail," so this adds
// real zoom instead of just fitting the whole image to the screen every time.
let imgViewerZoom = {scale:1, x:0, y:0};
function applyImgViewerTransform(){
  const img = document.getElementById('imgViewerImg');
  if(img) img.style.transform = `translate(${imgViewerZoom.x}px, ${imgViewerZoom.y}px) scale(${imgViewerZoom.scale})`;
}
// Swipe between photos: when a photo is opened, every other photo on the
// same screen that opens the viewer (viewImage / viewDrawing(...,true) /
// viewImageEl(this)) becomes the gallery, in on-screen order.
let imgGallery = [], imgGalleryIdx = 0;
function buildImgGallery(){
  const out = [];
  document.querySelectorAll('#app [onclick]').forEach(el=>{
    const oc = el.getAttribute('onclick')||''; let u = null, m;
    if(/viewImageEl\(this\)/.test(oc)) u = el.currentSrc || el.src;
    else if((m = /viewImage\('([^']+)'/.exec(oc))) u = m[1];
    else if((m = /viewDrawing\('([^']+)',\s*true/.exec(oc))) u = m[1];
    if(u && !out.includes(u)) out.push(u);
  });
  return out;
}
window.viewImageEl = function(el){ viewImage(el.currentSrc || el.src); };
function imgViewerShow(i){
  if(!imgGallery.length) return;
  imgGalleryIdx = (i + imgGallery.length) % imgGallery.length;
  imgViewerZoom = {scale:1, x:0, y:0};
  const img = document.getElementById('imgViewerImg');
  img.style.transform = 'translate(0px,0px) scale(1)';
  img.src = imgGallery[imgGalleryIdx];
  const multi = imgGallery.length > 1;
  const cnt = document.getElementById('imgViewerCount');
  if(cnt){ cnt.textContent = multi ? (imgGalleryIdx+1)+' / '+imgGallery.length : ''; cnt.style.display = multi ? '' : 'none'; }
  document.querySelectorAll('.img-viewer-nav').forEach(b=>{ b.style.display = multi ? '' : 'none'; });
  const hint = document.getElementById('imgViewerHint'); if(hint) hint.textContent = multi ? 'Swipe for more · pinch or double-tap to zoom' : 'Pinch or double-tap to zoom';
}
window.imgViewerStep = function(d){ if(imgGallery.length>1) imgViewerShow(imgGalleryIdx + d); };
document.addEventListener('keydown', e=>{
  const ov = document.getElementById('imgViewerOverlay');
  if(!ov || ov.style.display!=='flex') return;
  if(e.key==='ArrowLeft') imgViewerStep(-1);
  else if(e.key==='ArrowRight') imgViewerStep(1);
  else if(e.key==='Escape') closeImageViewer();
});
window.viewImage = function(url){
  let ov = document.getElementById('imgViewerOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'imgViewerOverlay';
    ov.className = 'img-viewer-overlay';
    ov.innerHTML = `
      <div class="img-viewer-hint" id="imgViewerHint">Swipe for more · pinch or double-tap to zoom</div>
      <div class="img-viewer-zoombtn" style="position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;z-index:2;" onclick="event.stopPropagation();closeImageViewer()">✕</div>
      <div id="imgViewerCount" class="img-viewer-count"></div>
      <div class="img-viewer-nav prev" onclick="event.stopPropagation();imgViewerStep(-1)">‹</div>
      <div class="img-viewer-nav next" onclick="event.stopPropagation();imgViewerStep(1)">›</div>
      <img id="imgViewerImg" draggable="false">
      <div class="img-viewer-zoombar">
        <div class="img-viewer-zoombtn" onclick="event.stopPropagation();imgViewerZoomBy(1.5)">+</div>
        <div class="img-viewer-zoombtn" onclick="event.stopPropagation();imgViewerZoomBy(1/1.5)">−</div>
      </div>
    `;
    document.body.appendChild(ov);
    setupImgViewerGestures(ov);
    ov.addEventListener('click', (e)=>{ if(e.target===ov) closeImageViewer(); });
  }
  imgGallery = buildImgGallery();
  let i = imgGallery.indexOf(url);
  if(i < 0){ imgGallery = [url]; i = 0; }
  imgViewerShow(i);
  ov.style.display = 'flex';
};
window.imgViewerZoomBy = function(factor){
  imgViewerZoom.scale = Math.min(6, Math.max(1, imgViewerZoom.scale*factor));
  if(imgViewerZoom.scale===1){ imgViewerZoom.x = 0; imgViewerZoom.y = 0; }
  applyImgViewerTransform();
};
function setupImgViewerGestures(ov){
  const img = ov.querySelector('#imgViewerImg');
  let pointers = new Map();
  let startDist = 0, startScale = 1, startMid = {x:0,y:0}, startPos = {x:0,y:0};
  let lastTap = 0;
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  let swipeStart = null;
  img.addEventListener('pointerdown', (e)=>{
    img.setPointerCapture(e.pointerId);
    swipeStart = (pointers.size===0 && imgViewerZoom.scale<=1) ? {x:e.clientX, y:e.clientY, t:Date.now()} : null;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pointers.size===2){
      const [a,b] = [...pointers.values()];
      startDist = dist(a,b); startScale = imgViewerZoom.scale; startMid = mid(a,b);
      startPos = {x:imgViewerZoom.x, y:imgViewerZoom.y};
    } else if(pointers.size===1){
      startPos = {x:e.clientX - imgViewerZoom.x, y:e.clientY - imgViewerZoom.y};
      const now = Date.now();
      if(now - lastTap < 300){
        imgViewerZoom = imgViewerZoom.scale>1 ? {scale:1,x:0,y:0} : {scale:2.5,x:0,y:0};
        applyImgViewerTransform();
      }
      lastTap = now;
    }
  });
  img.addEventListener('pointermove', (e)=>{
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pointers.size===2){
      const [a,b] = [...pointers.values()];
      const scale = Math.min(6, Math.max(1, startScale * (dist(a,b)/(startDist||1))));
      imgViewerZoom.scale = scale;
      const m = mid(a,b);
      imgViewerZoom.x = startPos.x + (m.x - startMid.x);
      imgViewerZoom.y = startPos.y + (m.y - startMid.y);
      applyImgViewerTransform();
    } else if(pointers.size===1 && imgViewerZoom.scale>1){
      imgViewerZoom.x = e.clientX - startPos.x;
      imgViewerZoom.y = e.clientY - startPos.y;
      applyImgViewerTransform();
    }
  });
  function endPointer(e){
    if(swipeStart && pointers.size===1 && imgViewerZoom.scale<=1 && e.type==='pointerup'){
      const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
      if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)*1.3 && Date.now()-swipeStart.t < 900) imgViewerStep(dx < 0 ? 1 : -1);
    }
    if(pointers.size>1) swipeStart = null;
    pointers.delete(e.pointerId);
    if(pointers.size<2 && imgViewerZoom.scale<=1){ imgViewerZoom.x = 0; imgViewerZoom.y = 0; applyImgViewerTransform(); }
  }
  img.addEventListener('pointerup', endPointer);
  img.addEventListener('pointercancel', endPointer);
  img.addEventListener('wheel', (e)=>{
    e.preventDefault();
    imgViewerZoomBy(e.deltaY<0 ? 1.15 : 1/1.15);
  }, {passive:false});
}
window.closeImageViewer = function(){
  const ov = document.getElementById('imgViewerOverlay');
  if(ov) ov.style.display = 'none';
};
// Permanent, platform-independent PDF viewer. Every previous approach here
// handed the PDF off to something outside our control — the native
// Browser plugin (Chrome Custom Tabs / SFSafariViewController) or a plain
// window.open — and asked THAT to show a sensible title via a
// Content-Disposition "?download=" filename hint. That trick only ever
// half-worked: Safari read it and showed the real name, Android Chrome's
// Custom Tabs read the same header as an instruction to silently start a
// background download instead of rendering the PDF, leaving a blank tab
// with nothing but the raw supabase.co URL visible as the "title" — the
// long-running "exports show the supabase link instead of the name" bug.
// No combination of query params fixes that for good, because it depends
// on the visiting browser/webview's own PDF handling, which varies by
// platform and even by OS version.
// The only way to guarantee the right name shows up everywhere, forever,
// is to stop asking someone else's viewer to display a title at all —
// render the PDF ourselves, inside our own header bar (which we already
// fully control), using pdf.js (already loaded for the drawings import
// feature). `source` is either a URL string (fetched over the network) or
// raw PDF bytes (a Uint8Array/ArrayBuffer) for a PDF we just built
// in-memory (RAMS/COSHH/TBT/Schedule/Reports exports) — skipping the
// upload-then-fetch round trip entirely for those.
// Custom pinch/pan/double-tap zoom for the PDF viewer, mirroring the image
// viewer above (setupImgViewerGestures) rather than relying on the
// browser's own page-pinch-zoom. Native page zoom used to be relaxed here
// instead, but it zoomed the whole overlay — including the fixed header bar
// and close button — which read as broken/janky rather than "zoom in on the
// drawing." A dedicated transform on just the pages wrapper keeps the header
// crisp and fixed while the document itself zooms and pans.
let pdfViewerZoom = {scale:1, x:0, y:0};
function applyPdfViewerTransform(){
  const wrap = document.getElementById('pdfViewerPagesWrap');
  const body = document.getElementById('pdfViewerBody');
  if(!wrap || !body) return;
  wrap.style.transform = `translate(${pdfViewerZoom.x}px, ${pdfViewerZoom.y}px) scale(${pdfViewerZoom.scale})`;
  // Below 1x zoom, hand scrolling back to the browser (normal multi-page
  // vertical scroll); once zoomed in, our own pan handles movement instead —
  // otherwise the two systems fight over the same drag gesture.
  const zoomed = pdfViewerZoom.scale > 1;
  body.style.overflow = zoomed ? 'hidden' : 'auto';
  wrap.style.touchAction = zoomed ? 'none' : 'pan-y';
}
// The wrap's own un-transformed (layout) top-left corner, in viewport
// coordinates — i.e. what its bounding rect would be if x/y/scale were all
// reset. Needed to convert a screen point (pinch midpoint, double-tap,
// wheel cursor, button-click centre) into a stable content-space point we
// can keep anchored under that same screen point as the scale changes.
// Without this, every zoom entry point just scaled from the wrap's fixed
// (0,0) transform-origin — the page appeared to zoom into its top-left
// corner and "lose the centre" instead of zooming in on what was on screen.
function pdfWrapOrigin(wrap){
  const rect = wrap.getBoundingClientRect();
  return {x: rect.left - pdfViewerZoom.x, y: rect.top - pdfViewerZoom.y};
}
// Zooms so the content currently under screen point (anchorX, anchorY)
// stays under that same point after the scale changes. Omit the anchor to
// zoom on the centre of the visible viewer area (used by the +/- buttons).
window.pdfViewerZoomBy = function(factor, anchorX, anchorY){
  const wrap = document.getElementById('pdfViewerPagesWrap');
  const body = document.getElementById('pdfViewerBody');
  if(!wrap || !body) return;
  const newScale = Math.min(8, Math.max(1, pdfViewerZoom.scale*factor));
  if(newScale === pdfViewerZoom.scale) return;
  if(anchorX===undefined || anchorY===undefined){
    const bodyRect = body.getBoundingClientRect();
    anchorX = bodyRect.left + bodyRect.width/2;
    anchorY = bodyRect.top + bodyRect.height/2;
  }
  const origin = pdfWrapOrigin(wrap);
  const cx = (anchorX - origin.x - pdfViewerZoom.x) / pdfViewerZoom.scale;
  const cy = (anchorY - origin.y - pdfViewerZoom.y) / pdfViewerZoom.scale;
  pdfViewerZoom.scale = newScale;
  if(newScale===1){ pdfViewerZoom.x = 0; pdfViewerZoom.y = 0; }
  else{
    pdfViewerZoom.x = anchorX - origin.x - cx*newScale;
    pdfViewerZoom.y = anchorY - origin.y - cy*newScale;
  }
  applyPdfViewerTransform();
};
function setupPdfViewerGestures(wrap){
  let pointers = new Map();
  let startDist = 0, startScale = 1, pinchOrigin = {x:0,y:0}, pinchContent = {x:0,y:0};
  let startPos = {x:0,y:0};
  let lastTap = 0;
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  wrap.addEventListener('pointerdown', (e)=>{
    wrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pointers.size===2){
      const [a,b] = [...pointers.values()];
      startDist = dist(a,b); startScale = pdfViewerZoom.scale;
      const m = mid(a,b);
      // Anchor on the content point under the pinch midpoint, same math as
      // pdfViewerZoomBy — this content point then tracks the fingers as
      // they move, instead of the page drifting off wherever (0,0) is.
      pinchOrigin = pdfWrapOrigin(wrap);
      pinchContent = {
        x: (m.x - pinchOrigin.x - pdfViewerZoom.x) / pdfViewerZoom.scale,
        y: (m.y - pinchOrigin.y - pdfViewerZoom.y) / pdfViewerZoom.scale,
      };
    } else if(pointers.size===1){
      startPos = {x:e.clientX - pdfViewerZoom.x, y:e.clientY - pdfViewerZoom.y};
      const now = Date.now();
      if(now - lastTap < 300){
        pdfViewerZoomBy((pdfViewerZoom.scale>1 ? 1 : 2.5)/pdfViewerZoom.scale, e.clientX, e.clientY);
      }
      lastTap = now;
    }
  });
  wrap.addEventListener('pointermove', (e)=>{
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pointers.size===2){
      e.preventDefault();
      const [a,b] = [...pointers.values()];
      const scale = Math.min(8, Math.max(1, startScale * (dist(a,b)/(startDist||1))));
      const m = mid(a,b);
      pdfViewerZoom.scale = scale;
      pdfViewerZoom.x = m.x - pinchOrigin.x - pinchContent.x*scale;
      pdfViewerZoom.y = m.y - pinchOrigin.y - pinchContent.y*scale;
      applyPdfViewerTransform();
    } else if(pointers.size===1 && pdfViewerZoom.scale>1){
      pdfViewerZoom.x = e.clientX - startPos.x;
      pdfViewerZoom.y = e.clientY - startPos.y;
      applyPdfViewerTransform();
    }
  });
  function endPointer(e){
    pointers.delete(e.pointerId);
    if(pointers.size<2 && pdfViewerZoom.scale<=1){ pdfViewerZoom.x = 0; pdfViewerZoom.y = 0; applyPdfViewerTransform(); }
  }
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);
  // Only treat wheel as zoom for an actual pinch-zoom gesture (trackpads and
  // browsers report these as a wheel event with ctrlKey set) or a held
  // Ctrl/Cmd — mirroring how every other zoomable surface (Google Maps,
  // PDF.js itself, image editors) tells plain scrolling apart from zooming.
  // Previously EVERY wheel/trackpad scroll was hijacked into a zoom, which
  // is what made the viewer feel like it "doesn't scroll, just zooms in and
  // out" — plain two-finger scroll on a trackpad, or a mouse wheel, never
  // reached the page at all.
  wrap.addEventListener('wheel', (e)=>{
    if(e.ctrlKey || e.metaKey){
      e.preventDefault();
      pdfViewerZoomBy(e.deltaY<0 ? 1.15 : 1/1.15, e.clientX, e.clientY);
      return;
    }
    // Not zoomed in: let the browser handle normal page scroll untouched.
    if(pdfViewerZoom.scale<=1) return;
    // Zoomed in: pan with the wheel instead of scrolling the (overflow:
    // hidden) body, so content doesn't get stuck off-screen.
    e.preventDefault();
    pdfViewerZoom.x -= e.deltaX;
    pdfViewerZoom.y -= e.deltaY;
    applyPdfViewerTransform();
  }, {passive:false});
}
window.viewPdfInApp = async function(source, filename, opts){
  let ov = document.getElementById('pdfViewerOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'pdfViewerOverlay';
    ov.className = 'pdf-viewer-overlay';
    ov.innerHTML = `
      <div class="pdf-viewer-bar">
        <span class="pdf-viewer-title" id="pdfViewerTitle"></span>
        <span class="pdf-viewer-btn" id="pdfViewerEmailBtn" title="Email" onclick="emailPdfViewerDoc()" style="display:none;">✉️</span>
        <span class="pdf-viewer-btn" id="pdfViewerSyncBtn" title="Save a copy to OneDrive" onclick="syncPdfViewerDoc()" style="display:none;">☁️</span>
        <span class="pdf-viewer-btn" id="pdfViewerShareBtn" title="Share / Save" onclick="sharePdfViewerDoc()">⤴</span>
        <span class="pdf-viewer-btn" title="Close" onclick="closePdfViewer()">✕</span>
      </div>
      <div class="pdf-viewer-body" id="pdfViewerBody"></div>
      <div class="img-viewer-hint" id="pdfViewerHint">Swipe for more · pinch or double-tap to zoom</div>
      <div class="img-viewer-zoombar">
        <div class="img-viewer-zoombtn" onclick="event.stopPropagation();pdfViewerZoomBy(1.5)">+</div>
        <div class="img-viewer-zoombtn" onclick="event.stopPropagation();pdfViewerZoomBy(1/1.5)">−</div>
      </div>
    `;
    document.body.appendChild(ov);
  }
  document.getElementById('pdfViewerTitle').textContent = filename || 'Document';
  // #(pdf-viewer-email-btn) 2026-09-30 — Andy kept trying to send a real
  // attachment via Share → Mail from the share sheet, which goes through
  // the same broken Web Share files API as WhatsApp (see sharePdfViewerDoc)
  // — the actually-reliable ✉️ Email option (a real server-side attachment,
  // no share sheet involved) lived only in a separate "..." menu on the
  // sheet's own page, nowhere near the PDF viewer someone naturally lands
  // on right after exporting. Surfacing it right here, next to Share, when
  // the caller provides one, so it's not something you have to already
  // know exists elsewhere.
  const emailBtn = document.getElementById('pdfViewerEmailBtn');
  if(emailBtn) emailBtn.style.display = (opts && opts.emailAction) ? '' : 'none';
  // ☁️ Save to OneDrive — on every PDF the app builds (exports), managers only.
  const syncBtn = document.getElementById('pdfViewerSyncBtn');
  if(syncBtn){ syncBtn.style.display = (opts && opts.canSync && ME && isManager(ME)) ? '' : 'none'; syncBtn.textContent = '☁️'; syncBtn.style.opacity = ''; }
  const body = document.getElementById('pdfViewerBody');
  body.innerHTML = '<p class="stub" style="color:#fff;opacity:.7;margin-top:40px;">Loading document…</p>';
  ov.style.display = 'flex';
  pdfViewerZoom = {scale:1, x:0, y:0};
  // Stashed so the Share button can hand the OS share sheet the exact same
  // bytes/name without re-fetching, and so closing the viewer can free them.
  const thisViewerState = pdfViewerState = {bytes: (typeof source!=='string' ? source : null), url: (typeof source==='string' ? source : null), filename: filename||'document.pdf', preparedUrl: null, emailAction: (opts && opts.emailAction) || null, siteId: (opts && opts.siteId) || null};
  // #(pre-upload-for-share): any await between the Share tap and the actual
  // share call (uploading the file, say) breaks iOS Safari's requirement
  // that a share/popup be triggered directly within the tap's own gesture —
  // silently, either as a blocked blank tab or as the Web Share API
  // reporting success while handing the recipient no real data. Uploading
  // here, right when the document opens (well before anyone taps Share),
  // means a real link is normally already sitting ready by the time they do
  // tap it, so that tap can call share synchronously with nothing to await
  // first. Runs in the background — doesn't block or delay the preview.
  // A document opened from storage (a Drawing, an existing upload) only has
  // a `url`, not bytes in hand — but Share needs bytes to hand Web Share's
  // `files` option something real (see sharePdfViewerDoc). Fetch it in the
  // background now, mirroring the upload below, so it's normally ready
  // before anyone gets to tapping Share.
  if(thisViewerState.url && !thisViewerState.bytes){
    (async ()=>{
      try{
        const res = await fetch(thisViewerState.url);
        if(res.ok){
          const buf = new Uint8Array(await res.arrayBuffer());
          if(pdfViewerState===thisViewerState) thisViewerState.bytes = buf;
        }
      }catch(e){ /* Share just won't have bytes ready if this didn't finish in time */ }
    })();
  }
  // (A generated PDF used to be uploaded to storage here on every single
  // export "so Share would have a link ready" — but nothing ever read that
  // link; Share uploads on tap. It cost an upload per export for nothing.)
  try{
    if(!(await loadLib('pdfjsLib'))) throw new Error('pdf renderer unavailable');
    const loadingTask = typeof source === 'string' ? pdfjsLib.getDocument(source) : pdfjsLib.getDocument({data: (source && source.slice) ? source.slice() : source}); // a COPY: the PDF renderer takes over (empties) the bytes it is given, which left Share and Save to OneDrive holding a 0-byte file
    const pdf = await loadingTask.promise;
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.id = 'pdfViewerPagesWrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform-origin:0 0;touch-action:pan-y;';
    body.appendChild(wrap);
    setupPdfViewerGestures(wrap);
    const containerWidth = Math.min(body.clientWidth || window.innerWidth, 900) - 4;
    // Render well past the on-screen fit size so pinching in on fine detail
    // (dimensions, hatching, small text on a roofing/site drawing) stays
    // sharp instead of blurring out past the old fixed low-res canvas — the
    // file itself was already full quality on upload (never downscaled),
    // this was purely about how much resolution the viewer rendered at.
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const ZOOM_HEADROOM = 4;
    const MAX_CANVAS_DIM = 6000; // headroom for modern devices while staying under older/low-end phones' canvas size ceiling
    // A photo-heavy report can run to 20+ pages, and rendering every one of
    // them at full headroom (each canvas here can be ~100MB uncompressed)
    // can exceed iOS/Android WebView's per-tab canvas memory ceiling and
    // crash/hang the app. Keep a total pixel budget across the WHOLE
    // document and scale each page's render resolution down as page count
    // grows, rather than always rendering every page at max headroom — a
    // 2-page report still gets full quality, a 30-page one renders smaller
    // (but still legible — never below a 1400px-long-edge floor).
    const TOTAL_PIXEL_BUDGET = 60000000; // ~240MB across the whole doc at 4 bytes/px
    const MIN_LONG_EDGE = 1400;
    for(let i=1; i<=pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({scale:1});
      const fitScale = containerWidth / baseViewport.width;
      let renderScale = fitScale * dpr * ZOOM_HEADROOM;
      const aspect = baseViewport.height / baseViewport.width;
      const perPageBudgetDim = Math.sqrt((TOTAL_PIXEL_BUDGET/pdf.numPages) / Math.max(aspect, 0.01));
      const maxDim = Math.min(MAX_CANVAS_DIM, Math.max(perPageBudgetDim, MIN_LONG_EDGE));
      if(baseViewport.width*renderScale > maxDim || baseViewport.height*renderScale > maxDim){
        renderScale = Math.min(maxDim/baseViewport.width, maxDim/baseViewport.height);
      }
      const viewport = page.getViewport({scale: renderScale});
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-viewer-page';
      canvas.width = viewport.width; canvas.height = viewport.height;
      canvas.style.width = Math.round(baseViewport.width*fitScale)+'px';
      canvas.style.height = Math.round(baseViewport.height*fitScale)+'px';
      wrap.appendChild(canvas);
      await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    }
  }catch(e){
    // #(pdf-viewer-dead-fallback-link): when `source` is raw bytes (every
    // freshly-generated export — Price Sheet, Schedule, Snags, etc. — hands
    // this straight from PDFLib rather than a storage URL) and pdf.js fails
    // to render it, this used to build the fallback link from `source`
    // itself, and `typeof source==='string'` is false for bytes, so it fell
    // back to a literal href="#" — a dead link that does nothing when
    // tapped, with no indication anything was wrong. Build a real blob: URL
    // from the bytes instead so the fallback link actually opens the file.
    let fallbackHref = '#';
    if(typeof source === 'string') fallbackHref = source;
    else{ try{ fallbackHref = URL.createObjectURL(new Blob([source], {type:'application/pdf'})); }catch(e2){} }
    body.innerHTML = `<div class="empty" style="color:#fff;opacity:.85;">Couldn't preview this document here.<br><a href="${fallbackHref}" target="_blank" style="color:#8fc4ff;">Open it directly instead</a></div>`;
  }
};
let pdfViewerState = null;
// #(share-2026-09-30-c) — Andy was clear: no new tab, share from within the
// exported document itself. That rules out every "navigate to Safari's own
// PDF view" attempt above this comment (all now dead ends, kept as history
// in git). The ONLY mechanism that shares without leaving this page at all
// is the browser's own Web Share files API — so that's back as the web
// path. Be honest about what this can and can't promise: on Andy's
// iPhone/iOS build specifically, that exact API has twice resolved with no
// error while handing WhatsApp a 0-byte file (a known WebKit bug, not
// something fixable from here) — so this in-page share may still not
// deliver a real attachment to every app every time. It's what actually
// satisfies "stay on this page", though, and it may simply work for
// whichever app is picked even if WhatsApp specifically remains unreliable.
// The two routes that ARE confirmed/likely reliable right now: the ✉️ Email
// button (server-side attachment, already working) for anything that must
// land as a real attachment today, and the native app's Share button
// (Capacitor Filesystem/Share plugins, never subject to this bug at all) —
// still untested only because Andy doesn't have Mac/Xcode access today.
window.sharePdfViewerDoc = async function(){
  if(!pdfViewerState) return;
  const bytes = pdfViewerState.bytes;
  if(!bytes){ toast('Still preparing this file — try Share again in a moment.'); return; }
  // #(share-call-must-be-immediate): deliberately no `await` before this —
  // any async work between the tap and the actual share call can break the
  // platform's requirement that it happen within that tap's own gesture.
  const blob = new Blob([bytes], {type:'application/pdf'});
  const status = await shareFile(blob, pdfViewerState.filename, 'application/pdf');
  if(status==='shared' || status==='cancelled') return;
  toast('Could not share this file here'+(lastShareErrorDetail ? ' — '+lastShareErrorDetail : '') + ' — try the ✉️ Email option instead, that one reliably attaches a real file.');
};
window.closePdfViewer = function(){
  const ov = document.getElementById('pdfViewerOverlay');
  if(ov) ov.style.display = 'none';
  const body = document.getElementById('pdfViewerBody');
  if(body) body.innerHTML = ''; // drop the rendered canvases so they don't sit in memory
  pdfViewerState = null;
  pdfViewerZoom = {scale:1, x:0, y:0};
};
// Drawings "View": images pop up in the in-app image viewer above; PDFs open
// in the in-app PDF viewer above (viewPdfInApp) — always shows the real
// document name in our own header bar, regardless of platform.
// The display "name" on a drawing can be freely renamed by a PM/admin (see
// renameDrawingFile) to anything, e.g. "Site Plan Rev 3" with no extension —
// but the real file extension never changes, since rename only touches the
// display title, not the stored file. If we hand that extension-less name
// straight to viewDrawing()'s ?download= filename, Safari/the browser can't
// tell what kind of file it is and falls back to showing the raw storage
// URL/domain as the title instead of a proper name. Always take the real
// extension from storage_path (never user-edited) and make sure the display
// name ends with it.
function drawingDownloadFilename(f){
  const m = /\.[a-z0-9]+$/i.exec(f.storage_path||'');
  const ext = m ? m[0] : '';
  return (ext && !f.name.toLowerCase().endsWith(ext.toLowerCase())) ? (f.name+ext) : f.name;
}
// Opens a file the app can't show itself (Excel, Word…). iPhone Safari
// blocks a new tab that's opened after the app has waited on the server, so
// if the new tab is refused the file is opened in this tab instead of
// nothing happening at all.
async function openExternalFile(url){
  if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser){
    await window.Capacitor.Plugins.Browser.open({url}); return;
  }
  let w = null;
  try{ w = window.open(url, '_blank'); }catch(e){}
  if(!w) location.href = url;
}
window.viewDrawing = async function(url, isImage, filename){
  if(isImage){ viewImage(url); return; }
  // Excel programme files can't be rendered by the in-app PDF viewer — hand
  // them straight to the browser/OS instead of trying (and failing) to open
  // them as a PDF.
  if(filename && /\.(xlsx|xls)$/i.test(filename)){
    await openExternalFile(url);
    return;
  }
  await viewPdfInApp(url, filename);
};
function compressImage(file, opts){
  // 1600px / 0.85 quality (the default) keeps photos sharp enough for
  // snagging reports and OneDrive exports while still compressing well
  // below the original camera file size (was 480px/0.6, which looked like
  // a thumbnail). That default is overkill for things that are never shown
  // bigger than a small icon (a company logo, for instance) — a full-size
  // modern phone photo (4000px+, several MB) run through the 1600px target
  // is real work for the JS-side canvas decode/redraw/encode, especially on
  // an older Android device, which is what made logo upload feel "frozen"
  // with no progress indicator shown while it churned. Pass {maxW, quality}
  // to use a smaller/faster target for cases like that.
  opts = opts || {};
  const maxW = opts.maxW || 1600;
  const quality = opts.quality != null ? opts.quality : 0.85;
  // #(compress-image-heic-detection) 2026-10-01 — "Could not process that
  // photo" on EVERY photo, reported by PMs filling in Reports on both iPhone
  // and Android, points at a format neither browser's <img>/canvas can
  // decode at all — HEIC/HEIF, which iPhones save to by default (Settings >
  // Camera > Formats > "High Efficiency") and which only Apple's own apps
  // reliably open. Picking that same photo straight from the Photos library
  // (rather than "Take Photo", which some camera/share sheets re-encode to
  // JPEG) hands the browser the original .heic file, and neither iOS Safari
  // nor Android Chrome/WebView can rasterize it into an <img> — this is a
  // real format-support gap, not something fixable by retrying the decode a
  // different way. Caught up front here so the toast actually explains what
  // happened instead of a generic failure every single time.
  const nameLower = (file && file.name || '').toLowerCase();
  const typeLower = (file && file.type || '').toLowerCase();
  if(typeLower==='image/heic' || typeLower==='image/heif' || /\.(heic|heif)$/.test(nameLower)){
    return Promise.reject(new Error('heic-unsupported'));
  }
  return new Promise((resolve,reject)=>{
    // Load the source photo via an object URL rather than a base64 data:
    // URL. FileReader.readAsDataURL on a modern phone camera photo (often
    // 5-15MB) produces an even bigger base64 string, and Android's WebView
    // — unlike desktop Chrome — can fail to decode an <img> whose src is a
    // very large data: URL, silently firing img.onerror on essentially
    // every camera photo ("Could not process that photo" on every upload).
    // createObjectURL avoids building that string at all, so it sidesteps
    // the size limit entirely and is the lower-memory, faster path anyway.
    let objectUrl = null;
    const cleanup = ()=>{ if(objectUrl){ URL.revokeObjectURL(objectUrl); objectUrl=null; } };
    const img = new Image();
    img.onerror = ()=>{ cleanup(); reject(new Error('image decode failed')); };
    img.onload = ()=>{
      try{
        const scale=Math.min(1,maxW/img.width);
        const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        const c=document.createElement('canvas'); c.width=w;c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        const out = c.toDataURL('image/jpeg',quality);
        cleanup();
        resolve(out);
      }catch(e){ cleanup(); reject(e); }
    };
    if(window.URL && URL.createObjectURL){
      try{ objectUrl = URL.createObjectURL(file); img.src = objectUrl; return; }
      catch(e){ /* fall through to FileReader below */ }
    }
    // Fallback for the rare environment without createObjectURL support.
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('read failed'));
    reader.onload=()=>{ img.src=reader.result; };
    reader.readAsDataURL(file);
  });
}
async function getGeo(){
  // In the native app, use Capacitor's Geolocation plugin — it drives Android's
  // runtime permission prompt properly. Bare navigator.geolocation inside an
  // embedded WebView often silently fails on Android because nothing ever
  // triggers the permission dialog.
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation){
    try{
      const perm = await window.Capacitor.Plugins.Geolocation.checkPermissions();
      if(perm.location !== 'granted' && perm.coarseLocation !== 'granted'){
        const req = await window.Capacitor.Plugins.Geolocation.requestPermissions();
        if(req.location !== 'granted' && req.coarseLocation !== 'granted'){
          return {error:'Location permission denied. Enable it for this app in your phone\'s Settings.'};
        }
      }
      const pos = await window.Capacitor.Plugins.Geolocation.getCurrentPosition({enableHighAccuracy:true, timeout:12000});
      return {lat:pos.coords.latitude, lon:pos.coords.longitude, accuracy:pos.coords.accuracy};
    }catch(e){
      return {error: (e && e.message) || 'Could not get your location.'};
    }
  }
  return new Promise(resolve=>{
    if(!navigator.geolocation){ resolve({error:'Location not supported.'}); return; }
    navigator.geolocation.getCurrentPosition(
      p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>resolve({error:e.message||'Location permission denied.'}),
      {enableHighAccuracy:true,timeout:12000,maximumAge:0}
    );
  });
}
function distMeters(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function startOfWeek(d){
  const dt = new Date(d);
  const day = (dt.getDay()+6)%7;
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate()-day);
  return dt.getTime();
}
