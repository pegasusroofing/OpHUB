/* ================= routing ================= */
// SELF_NAV guards against a WebView quirk (seen on this Android build) where
// simply assigning location.hash — our own go() calls, i.e. every ordinary
// button/link tap that navigates anywhere — ALSO fires 'popstate', not just
// real back/forward traversal like the spec says it should. Without this
// guard, the popstate safety net below would misread that as a real
// back-navigation and immediately redirect to CURRENT_BACK_HASH, which is
// why tapping anything while inside a site was bouncing straight back out.
// Cleared on 'hashchange' (fires right after popstate for the same
// navigation) with a short timeout fallback for the case where go() is
// called with the hash unchanged, which never fires hashchange at all.
let SELF_NAV = false;
// RENDER_GEN guards against a second, related race: navigating quickly
// (e.g. tapping into a site, then straight into a sub-screen before the
// first screen has finished loading its own data) could leave a slower,
// now-stale render() call finishing AFTER a newer one and overwriting the
// screen back to the old page — the URL hash showing the new screen while
// the content silently shows the old one. Every render*() function reads
// this counter when it starts and only paints the screen if it's still the
// most recent render pass by the time its data has loaded.
let RENDER_GEN = 0;
// Setting location.hash to the value it ALREADY holds does not fire a
// hashchange event — so go() would silently no-op, leaving whatever was on
// screen from an earlier, possibly-stale render() call (e.g. sign-in calls
// render() directly several times while ME/ORG/SITES are still loading,
// before finally calling go('#/sites') — if the hash was already '#/sites'
// from before sign-in, that final call did nothing, leaving the operative
// stuck on that earlier incomplete-data paint until they navigated away and
// back). Detect the no-op case and force a render() directly instead.
async function go(hash){
  // #(repair-job-unsaved-notes-prompt) 2026-09-30 — see the state/helpers
  // near repairJobUnsavedNotes above. Only triggers when actually leaving a
  // repair job's detail page with something genuinely unsaved; every other
  // navigation in the app falls straight through unchanged.
  if(repairJobUnsavedNotes && hash !== location.hash && /^#\/site\/[^/]+\/repairjob\/[^/]+$/.test(location.hash)){
    const dirty = repairJobUnsavedNotes;
    if(dirty.survey || dirty.progress || dirty.completion || dirty.pricedSchedule){
      const yes = await customConfirm('Save your notes on this job before leaving?', {confirmLabel:'Save & Leave', cancelLabel:'Discard & Leave'});
      if(yes) flushRepairJobUnsavedNotes();
    }
    repairJobUnsavedNotes = null;
  }
  SELF_NAV = true; setTimeout(function(){ SELF_NAV = false; }, 300);
  if(location.hash === hash){ render(); return; }
  location.hash = hash;
}
// Scroll position on navigation: the actual scrolling element is the
// window/body (see .scrollarea's CSS comment — #app is min-height:100vh,
// not height-capped, so it's the page itself that scrolls), and swapping
// #app's innerHTML on render() does NOT reset that scroll position on its
// own. Left alone, tapping into a new tile/folder from a page you'd
// scrolled down on landed you "mid-page" on the new screen too. Every real
// navigation (a hash change) now scrolls to the top of the new page by
// default — except when returning to a route you'd previously scrolled
// within during this session (e.g. stepping back into a long folder list),
// which restores exactly where you left it instead.
let scrollPositionByHash = {};
let lastScrollHash = location.hash;
window.addEventListener('hashchange', function(){
  const fromHash = lastScrollHash, toHash = location.hash;
  if(fromHash !== toHash) scrollPositionByHash[fromHash] = window.scrollY;
  lastScrollHash = toHash;
  SELF_NAV = false;
  // Safety net for the unsaved-notes guard in go() above: that guard only
  // catches navigation that goes through go() itself (back arrow, tab bar,
  // in-app links — the overwhelming majority). If the hash ever changes some
  // other way (e.g. a hardware/gesture back navigation) while still dirty,
  // there's no page left to save from — just drop the stale flag rather than
  // let it linger and misfire a save prompt on some future, unrelated page.
  if(repairJobUnsavedNotes && fromHash!==toHash && !/^#\/site\/[^/]+\/repairjob\/[^/]+$/.test(toHash)) repairJobUnsavedNotes = null;
  // A genuine navigation INTO a Price sub-tile's own page (not just a
  // same-page re-render triggered by saving a figure, which calls render()
  // directly without touching the hash) resets that tile's per-week
  // open/closed state — so leaving the tile and coming back always lands
  // on the default view (only the latest week open) again. Entering a
  // figure and staying on the page must NOT trigger this — see the
  // explicit priceWeekRowOpen[...] = true set alongside every save below.
  if(typeof priceWeekRowOpen!=='undefined' && /^#\/site\/[^/]+\/price\/element\//.test(toHash) && !/^#\/site\/[^/]+\/price\/element\//.test(fromHash)){
    priceWeekRowOpen = {};
  }
  // Leaving Admin Centre for a genuinely different tab/page (not just an
  // in-page dropdown toggle, which re-renders without touching the hash)
  // closes every open Admin Centre dropdown back up — so coming back in
  // later always lands on the tidy collapsed view instead of wherever it
  // was left expanded last time.
  if(typeof teamSectionOpen!=='undefined' && /^#\/team(\/|\?|$)/.test(fromHash) && !/^#\/team(\/|\?|$)/.test(toHash)){
    Object.keys(teamSectionOpen).forEach(function(k){ teamSectionOpen[k] = false; });
  }
  // Only restore a saved scroll position when this is genuinely a "back up"
  // move (the hash we're leaving is a deeper path under the one we're going
  // to — e.g. stepping back out of a folder list). Any other navigation,
  // including going back INTO a folder you'd previously scrolled down in,
  // must land at the top so its header is never hidden on first view.
  const isBackUp = fromHash.indexOf(toHash) === 0 && fromHash !== toHash;
  const pending = render();
  if(pending && pending.then){
    pending.then(function(){
      requestAnimationFrame(function(){ window.scrollTo(0, isBackUp ? (scrollPositionByHash[toHash] || 0) : 0); });
    });
  }
});
// Edge-swipe-to-go-back (left edge, swiping left→right), like the native iOS
// gesture. This deliberately goes up one folder level (whatever the current
// screen's own '‹' back arrow points to — CURRENT_BACK_HASH, kept in sync by
// shell()) rather than replaying raw browser history: history includes every
// hop taken to get here, so a plain history.back() could land somewhere
// sideways instead of "out" one level (e.g. RAMS → Health & Safety → site
// home → sites list), which is what this gesture is meant to feel like.
(function(){
  let startX = 0, startY = 0, tracking = false;
  const EDGE_PX = 60, SWIPE_PX = 60, MAX_VERTICAL = 60;
  document.addEventListener('touchstart', function(e){
    if(!e.touches || e.touches.length !== 1){ tracking = false; return; }
    const t = e.touches[0];
    tracking = t.clientX <= EDGE_PX;
    if(tracking){ startX = t.clientX; startY = t.clientY; }
  }, {passive:true});
  document.addEventListener('touchend', function(e){
    if(!tracking) return;
    tracking = false;
    const t = e.changedTouches && e.changedTouches[0];
    if(!t) return;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if(dx <= SWIPE_PX || Math.abs(dy) >= MAX_VERTICAL || !CURRENT_BACK_HASH) return;
    // Don't let this navigate the page underneath a full-screen viewer
    // overlay (PDF/image) — without this guard, swiping while looking at a
    // to-do attachment (or any other document) silently sent the page
    // behind it back a level, so closing the overlay landed somewhere
    // unexpected (e.g. site home) instead of back where you were.
    const pdfOv = document.getElementById('pdfViewerOverlay');
    if(pdfOv && pdfOv.style.display === 'flex') return;
    const imgOv = document.getElementById('imgViewerOverlay') || document.querySelector('.img-viewer-overlay');
    if(imgOv && getComputedStyle(imgOv).display !== 'none') return;
    go(CURRENT_BACK_HASH);
  }, {passive:true});
})();
// Safety net for platforms where "swipe back" isn't caught by the manual
// touch handler above and instead triggers a REAL browser/WebView back
// navigation — Android's hardware/gesture back button (Capacitor's default
// Android bridge falls back to WebView.goBack() when nothing else handles
// it) or a native edge-swipe in a plain browser tab. That kind of back
// replays raw hash history, same problem the comment above describes.
// 'popstate' is supposed to only fire for a real history traversal, never
// for our own go()/location.hash= pushes — but see the SELF_NAV comment
// above for why that's not reliably true on every WebView, hence the guard.
// It fires before 'hashchange' for the same navigation, so CURRENT_BACK_HASH
// here still holds the screen we were just on — redirecting it here
// overrides wherever raw history landed us.
window.addEventListener('popstate', function(){
  if(SELF_NAV) return;
  if(CURRENT_BACK_HASH) go(CURRENT_BACK_HASH);
});
// Close the PM-filter dropdown (home page) and the per-site status/PM-picker
// dropdowns (the "Active ▾" style menus) on any tap outside them, instead of
// only via their own toggle button. Every trigger and dropdown panel for
// these already calls event.stopPropagation() on its own click, so any click
// that reaches this document-level listener is — by construction — outside
// all of them.
document.addEventListener('click', function(e){
  let changed = false;
  if(pmFilterOpen && !e.target.closest('[data-pmfilter-root]')){ pmFilterOpen = false; changed = true; }
  if(siteStatusMenuOpenId && !e.target.closest('.status, .statusmenu')){ siteStatusMenuOpenId = null; changed = true; }
  if(sitePmPickerOpenId && !e.target.closest('.rolechip, .statusmenu')){ sitePmPickerOpenId = null; changed = true; }
  if(checkinLogOperativeFilterOpen && !e.target.closest('[data-checkinopfilter-root]')){ checkinLogOperativeFilterOpen = false; changed = true; }
  if(ppeLogOperativeFilterOpen && !e.target.closest('[data-ppelogopfilter-root]')){ ppeLogOperativeFilterOpen = false; changed = true; }
  if(calHomePmFilterOpen && !e.target.closest('[data-calhomepmfilter-root]')){ calHomePmFilterOpen = false; changed = true; }
  if(calHomeSiteFilterOpen && !e.target.closest('[data-calhomesitefilter-root]')){ calHomeSiteFilterOpen = false; changed = true; }
  if(opFolderMenuOpenFor && !e.target.closest('[data-opfoldermenu-root]')){ opFolderMenuOpenFor = null; changed = true; }
  if(rowActionsMenuOpenFor && !e.target.closest('[data-rowactions-root]')){ rowActionsMenuOpenFor = null; changed = true; }
  if(calViewModePickerOpen && !e.target.closest('[data-rowactions-root]')){ calViewModePickerOpen = false; changed = true; }
  if(changed) render();
});
// Custom confirmation dialog, replacing the native window.confirm(). On this
// build's Android WebView, window.confirm() was returning immediately
// without ever showing anything — so every "Are you sure?" prompt (delete
// site, assign PM, etc.) silently cancelled itself and looked like the
// button just didn't work / got stuck. This reuses the same persistent-
// overlay pattern as the GPS options modal (openGeoOptions) below, which is
// known to render reliably, instead of relying on a native browser dialog.
// Usage: if(!await customConfirm('Are you sure?')) return;
let _confirmResolve = null;
function customConfirm(message, opts){
  opts = opts || {};
  return new Promise(resolve=>{
    _confirmResolve = resolve;
    let ov = document.getElementById('confirmModalOverlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'confirmModalOverlay';
      ov.className = 'geo-modal-overlay';
      document.body.appendChild(ov);
    }
    ov.onclick = (e)=>{ if(e.target===ov) window._confirmAnswer(false); };
    ov.innerHTML = `
      <div class="geo-modal-card">
        <p class="stub" style="margin:0 0 18px;font-weight:600;color:var(--ink);white-space:pre-line;max-height:55vh;overflow-y:auto;">${escapeHtml(message)}</p>
        <button class="darkbtn" style="width:100%;margin-bottom:8px;${opts.danger?'background:var(--warn);':''}" onclick="window._confirmAnswer(true)">${escapeHtml(opts.confirmLabel||'Yes, continue')}</button>
        <button class="geo-modal-cancel" onclick="window._confirmAnswer(false)">${escapeHtml(opts.cancelLabel||'Cancel')}</button>
      </div>`;
    ov.style.display = 'flex';
  });
}
window._confirmAnswer = function(result){
  const ov = document.getElementById('confirmModalOverlay');
  if(ov) ov.style.display = 'none';
  const resolve = _confirmResolve;
  _confirmResolve = null;
  if(resolve) resolve(result);
};
// Same overlay, single-button variant for a plain heads-up message (no
// yes/no choice needed) — e.g. "choose a supplier before sending".
function customAlert(message){
  let ov = document.getElementById('confirmModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'confirmModalOverlay';
    ov.className = 'geo-modal-overlay';
    document.body.appendChild(ov);
  }
  ov.onclick = (e)=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `
    <div class="geo-modal-card">
      <p class="stub" style="margin:0 0 18px;font-weight:600;color:var(--ink);">${escapeHtml(message)}</p>
      <button class="darkbtn" style="width:100%;" onclick="document.getElementById('confirmModalOverlay').style.display='none';">OK</button>
    </div>`;
  ov.style.display = 'flex';
}
// Same overlay again, text-input variant — replaces window.prompt() (which
// the Capacitor native WebView doesn't reliably implement; on the phone app
// it can silently return null with no dialog ever appearing at all — this is
// why "rename" actions like Drawings looked broken on the app specifically).
let _promptResolve = null;
function customPrompt(message, defaultValue){
  return new Promise(resolve=>{
    _promptResolve = resolve;
    let ov = document.getElementById('confirmModalOverlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'confirmModalOverlay';
      ov.className = 'geo-modal-overlay';
      document.body.appendChild(ov);
    }
    ov.onclick = (e)=>{ if(e.target===ov) window._promptAnswer(null); };
    ov.innerHTML = `
      <div class="geo-modal-card">
        <p class="stub" style="margin:0 0 10px;font-weight:600;color:var(--ink);">${escapeHtml(message)}</p>
        <div class="formfield" style="margin-top:0;"><input type="text" id="customPromptInput" value="${escapeHtml(defaultValue||'')}" onkeyup="if(event.key==='Enter')window._promptAnswer(document.getElementById('customPromptInput').value);"></div>
        <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="window._promptAnswer(document.getElementById('customPromptInput').value)">OK</button>
        <button class="geo-modal-cancel" onclick="window._promptAnswer(null)">Cancel</button>
      </div>`;
    ov.style.display = 'flex';
    const input = document.getElementById('customPromptInput');
    if(input){ input.focus(); input.select(); }
  });
}
window._promptAnswer = function(result){
  const ov = document.getElementById('confirmModalOverlay');
  if(ov) ov.style.display = 'none';
  const resolve = _promptResolve;
  _promptResolve = null;
  if(resolve) resolve(result);
};
// Same overlay/resolve plumbing as customPrompt, plus a "CC me a copy" tick
// box — used everywhere a single typed recipient email is collected for
// sending a document (RAMS/COSHH/TBT/Site Induction/Price Sheet). Resolves
// to {value, ccMe} on OK, or null on Cancel (same falsy-on-cancel contract
// as customPrompt).
// Optional `site` param (added alongside the "CC client contact" rollout):
// when given and it has a client_email on file, a second tick box appears
// below "CC me a copy" and the resolved answer carries `ccClient` (bool)
// alongside `ccMe` — callers turn that into the site's client_email
// themselves (see ccClientEmailFromPromptAnswer below) rather than this
// generic prompt knowing about client_cc_email as a concept.
function customPromptWithCc(message, defaultValue, site){
  return new Promise(resolve=>{
    _promptResolve = resolve;
    let ov = document.getElementById('confirmModalOverlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'confirmModalOverlay';
      ov.className = 'geo-modal-overlay';
      document.body.appendChild(ov);
    }
    ov.onclick = (e)=>{ if(e.target===ov) window._promptAnswer(null); };
    ov.innerHTML = `
      <div class="geo-modal-card">
        <p class="stub" style="margin:0 0 10px;font-weight:600;color:var(--ink);">${escapeHtml(message)}</p>
        <div class="formfield" style="margin-top:0;"><input type="text" id="customPromptInput" value="${escapeHtml(defaultValue||'')}" onkeyup="if(event.key==='Enter')window._promptAnswerCc();"></div>
        <label style="display:flex;align-items:center;gap:8px;margin:-4px 0 8px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;">
          <input type="checkbox" id="customPromptCcMe" style="width:18px;height:18px;flex:none;">
          CC me a copy
        </label>
        ${site && site.client_email ? `
        <label style="display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;">
          <input type="checkbox" id="customPromptCcClient" style="width:18px;height:18px;flex:none;">
          CC client contact${(site.client_contact_name||site.client_name)?' ('+escapeHtml(site.client_contact_name||site.client_name)+')':''}
        </label>` : ''}
        <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="window._promptAnswerCc()">OK</button>
        <button class="geo-modal-cancel" onclick="window._promptAnswer(null)">Cancel</button>
      </div>`;
    ov.style.display = 'flex';
    const input = document.getElementById('customPromptInput');
    if(input){ input.focus(); input.select(); }
  });
}
window._promptAnswerCc = function(){
  const input = document.getElementById('customPromptInput');
  const cc = document.getElementById('customPromptCcMe');
  const ccClient = document.getElementById('customPromptCcClient');
  window._promptAnswer({value: input?input.value:'', ccMe: !!(cc&&cc.checked), ccClient: !!(ccClient&&ccClient.checked)});
};
// Turns a customPromptWithCc answer + the site it was called with into the
// literal email address to pass as client_cc_email, or null.
function ccClientEmailFromPromptAnswer(answer, site){
  return (answer && answer.ccClient && site && site.client_email) ? site.client_email : null;
}
// Turns a customPromptWithCc answer into the actual {to, cc} pair to send
// with — handles the case where "CC me a copy" is ticked but the typed
// recipient row was left empty: that used to mean nothing sent at all (every
// caller bailed out on `!answer.value` before even looking at ccMe), even
// though "CC me a copy" ticked with no one else typed in clearly means "just
// send it to me". Here that becomes `to: ME.email` with no separate cc
// (there's no one else to distinguish it from). Returns null when there's
// truly nothing to send to (empty row, "CC me" not ticked).
function resolvePromptEmailTo(answer){
  const typed = (answer && answer.value || '').trim();
  if(typed) return {to: typed, cc: answer.ccMe ? ME.email : undefined};
  if(answer && answer.ccMe) return {to: ME.email, cc: undefined};
  return null;
}
// Same overlay/resolve plumbing as customPrompt above, just a date input
// instead of text — used anywhere a single date needs picking outside a
// full form (e.g. the "Starts <date>" chip on the site list).
function customDatePrompt(message, defaultValue){
  return new Promise(resolve=>{
    _promptResolve = resolve;
    let ov = document.getElementById('confirmModalOverlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'confirmModalOverlay';
      ov.className = 'geo-modal-overlay';
      document.body.appendChild(ov);
    }
    ov.onclick = (e)=>{ if(e.target===ov) window._promptAnswer(null); };
    ov.innerHTML = `
      <div class="geo-modal-card">
        <p class="stub" style="margin:0 0 10px;font-weight:600;color:var(--ink);">${escapeHtml(message)}</p>
        <div class="formfield" onclick="openDatePickerRow(this)" style="margin-top:0;min-width:0;max-width:100%;"><input type="date" id="customDatePromptInput" value="${escapeHtml(defaultValue||'')}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
        <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="window._promptAnswer(document.getElementById('customDatePromptInput').value)">OK</button>
        <button class="geo-modal-cancel" onclick="window._promptAnswer(null)">Cancel</button>
      </div>`;
    ov.style.display = 'flex';
    const input = document.getElementById('customDatePromptInput');
    if(input) input.focus();
  });
}
function parseRoute(){
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return h.split('/').filter(Boolean);
}
function routeQuery(){
  const q = location.hash.split('?')[1];
  return new URLSearchParams(q||'');
}
