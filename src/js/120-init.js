/* ================= init ================= */
async function saveBootSnapshot(){
  if(!SESSION || !ME) return;
  try{
    await setJSON(K_BOOT, {
      uid: SESSION.user.id, at: Date.now(),
      me: ME, org: ORG, sites: SITES, profiles: PROFILES,
      homeExtras: {uid: homeExtras.uid, onboarding: homeExtras.onboarding, count: homeExtras.count},
      hsGateOk: hsPolicyGateChecked && !hsPolicyGatePending,
    }, false);
  }catch(e){ /* best-effort */ }
}
// Background half of the fast start: after the home page has been painted
// from the saved snapshot, quietly fetch the real thing and only redraw if
// something actually changed.
let bootRefreshing = false;
async function refreshBootData(){
  if(bootRefreshing || !SESSION || navigator.onLine === false) return;
  bootRefreshing = true;
  try{
    const uid = SESSION.user.id;
    await ensureFreshToken();
    if(!SESSION){ render(); return; } // refresh token was rejected — back to sign-in
    const prof = await dbSelectChecked('profiles', 'id=eq.'+uid+'&select=*');
    if(!SESSION || SESSION.user.id !== uid || !prof.ok) return;
    if(!prof.data[0]){
      // The account genuinely no longer exists (removed from the company).
      SESSION = null; ME = null; ORG = null;
      await sdelete(K_SESSION, false); await sdelete(K_BOOT, false);
      render();
      return;
    }
    const before = JSON.stringify([ME, ORG, SITES]);
    ME = prof.data[0];
    const [, , sitesRes] = await Promise.all([
      loadOrg(),
      loadAllProfiles(true),
      dbSelectChecked('sites', 'select=*&order=created_at.asc'),
    ]);
    if(!SESSION || SESSION.user.id !== uid) return;
    if(sitesRes.ok) SITES = sitesRes.data;
    await saveBootSnapshot();
    if(JSON.stringify([ME, ORG, SITES]) !== before && !scheduleControlBusy()) render();
  }catch(e){ console.error('refreshBootData failed', e); }
  finally{ bootRefreshing = false; }
}
// Re-checks the compulsory H&S Policy sign-off after a snapshot start (which
// trusts the last known answer so the first paint isn't held up by it).
async function recheckHsPolicyGate(){
  if(!ME || ME.role==='superadmin' || navigator.onLine === false) return;
  hsPolicyGateChecked = false;
  const pending = await checkHsPolicyGate();
  saveBootSnapshot();
  if(pending) render();
}
function registerServiceWorker(){
  try{
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if(isNative || !('serviceWorker' in navigator) || (location.protocol !== 'https:' && location.hostname !== 'localhost')) return;
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }catch(e){}
}
// Every time the app is opened while already signed in, the phone is checked
// again — not just at sign-in — so a lock that was removed, or an account
// moved onto this phone some other way, is caught. A failed request (no
// signal) never signs anybody out; only a definite "not allowed" does.
async function recheckDeviceLockOnOpen(){
  try{
    if(!SESSION || !ME || !deviceLockApplies(ME) || navigator.onLine === false) return;
    const lock = await checkDeviceLock();
    if(!lock || (lock.error!=='device_locked' && lock.error!=='pending_approval')) return; // only a definite refusal signs anyone out
    const msg = deviceLockMessage(lock);
    await doSignOut();
    authError = msg;
    render();
  }catch(e){ /* never blocks start-up */ }
}
async function init(){
  registerServiceWorker();
  SESSION = await getJSON(K_SESSION, false, null);
  // FAST START: if this device has a saved snapshot for the signed-in user,
  // paint from it immediately — no network needed for the first screen, so
  // it also works with no signal — then refresh in the background.
  const snap = SESSION ? await getJSON(K_BOOT, false, null) : null;
  if(SESSION && snap && snap.uid === SESSION.user.id && snap.me && snap.me.id === SESSION.user.id){
    ME = snap.me; ORG = snap.org || null; SITES = Array.isArray(snap.sites) ? snap.sites : [];
    if(snap.profiles && Object.keys(snap.profiles).length){ PROFILES = snap.profiles; profilesLoadedAt = Date.now(); }
    if(snap.homeExtras && snap.homeExtras.uid === ME.id) homeExtras = {uid: ME.id, onboarding: snap.homeExtras.onboarding || null, count: snap.homeExtras.count || 0, at: 0, loading: false};
    if(snap.hsGateOk){ hsPolicyGateChecked = true; hsPolicyGatePending = false; }
    applyTheme(ORG);
    const firstPaint = render();
    if(ME.role!=='superadmin') registerPushNotifications();
    firstPaint.then(()=>{ warmUpLibs(); });
    refreshBootData().then(()=>{ if(snap.hsGateOk) recheckHsPolicyGate(); });
    recheckDeviceLockOnOpen();
    return;
  }
  if(SESSION){
    await ensureFreshToken();
    if(SESSION){
      await loadProfile();
      if(!ME){ SESSION=null; ME=null; }
    }
  }
  if(SESSION && ME){
    // These three only need ME (already loaded above) and don't depend on
    // each other's results, so fetch them together instead of one after
    // another — this is the very first screen the app shows, so cutting it
    // from three sequential round trips to one saves real time on every
    // login/app open.
    const [, , sitesRows] = await Promise.all([
      loadOrg(),
      loadAllProfiles(),
      dbSelect('sites', 'select=*&order=created_at.asc'),
    ]);
    SITES = sitesRows;
    if(ME.role!=='superadmin') registerPushNotifications();
  } else {
    applyTheme(null);
  }
  await render();
  if(SESSION && ME) saveBootSnapshot();
  warmUpLibs();
  recheckDeviceLockOnOpen();
}

// Site Home's status strip has Job No on the left and an on-site pill on the
// right, both shrink-wrapped to their own text — so they naturally end up
// different widths despite sitting in equal grid tracks. This equalizes
// them to the WIDER of the two (never shrinking the pill below its own
// natural single-line width, which would wrap "Not checked in" onto two
// lines) — run after every Site Home paint (see renderSiteHome).
function equalizeStatusStripWidths(){
  try{
    const strip = document.querySelector('.status-strip');
    if(!strip) return;
    const first = strip.children[0], last = strip.children[1];
    if(!first || !last) return;
    first.style.width = ''; last.style.width = '';
    const w = Math.ceil(Math.max(first.getBoundingClientRect().width, last.getBoundingClientRect().width));
    if(w>0){ first.style.width = w+'px'; last.style.width = w+'px'; }
  }catch(e){ /* non-fatal — cosmetic only */ }
}
// Site Home tile titles (e.g. "Drawings & Specifications") can be too long
// for the half-width tile at the standard label size and wrap onto a second
// line. Rather than wrapping, shrink that one label's font just enough to
// spread across the tile on a single line, down to a readable floor — past
// that it's left to wrap rather than becoming illegible. Run after every
// Site Home paint (see renderSiteHome).
function fitTileLabelsOneLine(){
  try{
    document.querySelectorAll('.hometiles .tile .lbl').forEach(el=>{
      el.style.fontSize = '';
      let guard = 0;
      // Floor raised from 9.5px to 12px — past that point it now wraps onto
      // a second line at a still-legible size instead of continuing to
      // shrink towards an eventually-tiny, hard-to-read single line.
      while(guard++ < 14){
        const cs = getComputedStyle(el);
        let lh = parseFloat(cs.lineHeight);
        if(isNaN(lh)) lh = parseFloat(cs.fontSize)*1.2;
        const size = parseFloat(cs.fontSize);
        if(el.getBoundingClientRect().height <= lh*1.3 || size<=12) break;
        el.style.fontSize = (size-0.5)+'px';
      }
    });
  }catch(e){ /* non-fatal — cosmetic only */ }
}
