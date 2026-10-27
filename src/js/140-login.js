/* ================= LOGIN ================= */
let authBusy = false;
let authBusyLabel = null; // shown on the Sign In button while authBusy — kept up to date at each stage so a slow step never just looks frozen on "Please wait…"
let authError = null;
let authInfo = null, authPrefillEmail = '';
// #(forgot-password) Emails a one-time link (send-password-reset edge
// function); the link opens #/reset here to choose a new password.
window.forgotPassword = async function(){
  const typed = (document.getElementById('authEmail')||{}).value || '';
  const email = await customPrompt('Enter the email you log in with and we\'ll send you a link to choose a new password.', typed.trim());
  if(email === null) return;
  const e = String(email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){ toast('Enter a valid email address.'); return; }
  try{
    await fetchWithTimeout(SUPABASE_URL+'/functions/v1/send-password-reset', {method:'POST', headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json'}, body: JSON.stringify({email:e})}, 15000);
  }catch(err){ toast('Could not reach the server — check your connection and try again.'); return; }
  authError = null; authInfo = 'If '+e+' has an account, a reset link is on its way. Check your email (and junk folder).'; authPrefillEmail = e; render();
};
function resetParams(){
  const q = String(location.hash||'').split('?')[1] || '';
  // A cut-off link (a broken %-code) must not crash the page (CORE-L11).
  const dec = x => { try{ return decodeURIComponent(x); }catch(e){ return x; } };
  const o = {}; q.split('&').forEach(kv=>{ const i = kv.indexOf('='); if(i>0) o[dec(kv.slice(0,i))] = dec(kv.slice(i+1)); });
  return o;
}
let resetBusy = false, resetError = null;
function renderResetPassword(){
  const p = resetParams();
  document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Choose a new password</p>
      ${p.e ? `<p class="stub" style="margin:0 0 12px;">For <b>${escapeHtml(p.e)}</b></p>` : ''}
      ${resetError ? `<div class="errbox">${escapeHtml(resetError)}</div>` : ''}
      ${!p.t ? `<p class="stub">This link isn't complete. Go back to the log in page and tap "Forgot password?" again.</p>` : `
      <div class="formfield"><label class="field-label">New password</label><input type="password" id="resetPw1" placeholder="At least 8 characters" autocomplete="new-password"></div>
      <div class="formfield"><label class="field-label">Type it again</label><input type="password" id="resetPw2" autocomplete="new-password"></div>
      <button class="primarybtn" style="background:var(--brand1);color:var(--brand1-text);border-color:var(--brand1);" ${resetBusy?'disabled':''} onclick="doResetPassword()">${resetBusy ? '<span class="spinner"></span>Saving…' : 'Save new password'}</button>`}
      <p style="text-align:center;margin:14px 0 0;"><span class="viewlink" style="cursor:pointer;" onclick="resetError=null;location.hash='';render()">Back to log in</span></p>
    </div>
  `, {centerTitle:true, tabs:false});
}
window.doResetPassword = async function(){
  const p = resetParams();
  const a = (document.getElementById('resetPw1')||{}).value || '', b = (document.getElementById('resetPw2')||{}).value || '';
  if(a.length < 8){ resetError = 'Use at least 8 characters.'; render(); return; }
  if(a !== b){ resetError = "The two passwords don't match."; render(); return; }
  resetBusy = true; resetError = null; render();
  try{
    const vr = await fetchWithTimeout(SUPABASE_URL+'/auth/v1/verify', {method:'POST', headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'}, body: JSON.stringify({type:'recovery', token_hash: p.t})}, 15000);
    const vd = await vr.json().catch(()=>({}));
    if(!vr.ok || !vd.access_token){ resetBusy = false; resetError = 'This link has expired or has already been used. Go back to log in and tap "Forgot password?" for a new one.'; render(); return; }
    const ur = await fetchWithTimeout(SUPABASE_URL+'/auth/v1/user', {method:'PUT', headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+vd.access_token,'Content-Type':'application/json'}, body: JSON.stringify({password:a})}, 15000);
    const ud = await ur.json().catch(()=>({}));
    resetBusy = false;
    if(!ur.ok){ resetError = (ud && (ud.msg||ud.error_description||ud.message)) || 'Could not save the new password — try again.'; render(); return; }
    fetchWithTimeout(SUPABASE_URL+'/auth/v1/logout', {method:'POST', headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+vd.access_token}}, 8000).catch(()=>{});
    authError = null; authInfo = 'Password changed — log in with your new password.'; authPrefillEmail = p.e || (vd.user && vd.user.email) || '';
    try{ const r0 = JSON.parse(localStorage.getItem(K_REMEMBER)||"null"); if(r0 && r0.email) localStorage.setItem(K_REMEMBER, JSON.stringify({email:r0.email})); }catch(e){} // new password: forget the old saved one
    if(SESSION && SESSION.user && authPrefillEmail && String(SESSION.user.email||'').toLowerCase()===authPrefillEmail.toLowerCase()){ await doSignOut(); }
    location.hash = ''; render();
  }catch(e){ resetBusy = false; resetError = 'Could not reach the server — check your connection and try again.'; render(); }
};
function renderLogin(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(__gen === RENDER_GEN){ app.innerHTML = shell(`
    <div class="card">
      ${authError ? `<div class="errbox">${escapeHtml(authError)}</div>` : ''}
      ${authInfo ? `<div class="card" style="background:var(--ok-bg);border-color:var(--ok);color:var(--ok);font-weight:700;padding:10px 12px;margin-bottom:12px;">${escapeHtml(authInfo)}</div>` : ''}
      <form id="authForm" autocomplete="on" onsubmit="event.preventDefault();doSignIn();" style="margin:0;">
      <div class="formfield">
        <label class="field-label">Email</label>
        <input type="email" id="authEmail" name="username" autocomplete="username" value="${escapeHtml(authPrefillEmail || rememberedAuth().email)}" placeholder="you@yourcompany.co.uk">
      </div>
      <div class="formfield">
        <label class="field-label">Password</label>
        <input type="password" id="authPassword" name="password" value="" placeholder="••••••••" autocomplete="current-password" onkeyup="maybeAutoSignIn(event)">
      </div>
      <label class="stub" style="display:flex;align-items:center;gap:6px;margin:2px 0 12px;"><input type="checkbox" id="authRemember" style="width:auto;" ${rememberedAuth().remember?'checked':''}>Remember my email and password on this device</label>
      <button type="submit" style="display:none;" tabindex="-1" aria-hidden="true"></button>
      </form>
      <button class="primarybtn" style="background:var(--brand1);color:var(--brand1-text);border-color:var(--brand1);" ${authBusy?'disabled':''} onclick="doSignIn()">
        ${authBusy ? '<span class="spinner"></span>'+escapeHtml(authBusyLabel||'Please wait…') : 'Sign In'}
      </button>
      <p style="text-align:center;margin:12px 0 0;"><span class="viewlink" style="cursor:pointer;font-weight:700;" onclick="forgotPassword()">Forgot password?</span></p>
      <p class="stub" style="margin-top:10px;">Real Supabase account — password is never seen or stored by our servers. Ticking "Remember" keeps your email and password on this device (the password is stored encrypted) so they're filled in for you next time. Untick it on a shared device. You stay signed in until you tap Sign out.</p>
      <p class="stub" style="margin-top:14px;">New team member? You'll need an invite link from your Project Manager to create an account — sign-up isn't open to the public.</p>
    </div>
    <div style="display:flex;justify-content:center;margin-top:22px;">
      <img src="${orgLogoUrl(ORG)}" alt="OpHUB" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="width:226.8px;height:226.8px;border-radius:32.4px;object-fit:cover;box-shadow:0 3.6px 16.2px rgba(0,0,0,0.12);max-width:75vw;max-height:75vw;">
    </div>
  `, {centerTitle:true, tabs:false}); authPwFill(); }
}
window.maybeAutoSignIn = function(ev){
  // Only Enter submits — a bare "fields look filled" trigger caused false
  // sign-ins whenever the browser's saved-password autofill populated the
  // form (e.g. switching accounts on a shared device), signing people in as
  // whoever was saved before they could change the email. Explicit Sign In
  // click or Enter key only, from here on.
  if(ev && ev.key === 'Enter'){ doSignIn(); }
};
// "Remember me" on the sign-in page — the email, plus (27 Oct, Andy) the password
// encrypted with AES-GCM under a key that can't be read out of the browser (authPw*). Opt-in
// via the checkbox; unticking it (or a fresh sign-in without it checked)
// clears whatever was saved.
function rememberedAuth(){
  try{
    const raw = localStorage.getItem(K_REMEMBER);
    if(!raw) return {email:'', remember:false};
    const parsed = JSON.parse(raw);
    return {email: (parsed && typeof parsed.email==='string') ? parsed.email : '', remember:true};
  }catch(e){ return {email:'', remember:false}; }
}
window.doSignIn = async function(){
  if(authBusy) return; // Enter key + button tap at the same time used to start two sign-ins
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const remember = document.getElementById('authRemember') && document.getElementById('authRemember').checked;
  authPrefillEmail = email; // keep what they typed if the password's wrong
  if(!email || !password){ authError='Enter your email and password.'; render(); return; }
  try{ if(!remember) localStorage.removeItem(K_REMEMBER); }catch(e){}
  // authBusy stays true (and the button stays showing progress) for the
  // WHOLE sign-in sequence, not just the initial password check — it used
  // to flip back to false the moment the password check passed, but with
  // no render() call there to show it, so the button just sat on "Please
  // wait…" unchanged through several more network calls afterwards
  // (profile, device lock, org, team, sites). Any one of those being slow
  // looked exactly like a permanent freeze even though it was still
  // working. Now every stage updates authBusyLabel and re-renders, and the
  // whole thing is wrapped in try/catch/finally so a failure anywhere
  // always leaves the button clickable again with a real error, instead of
  // stuck.
  authBusy = true; authBusyLabel = 'Signing in…'; authError = null; authInfo = null; render();
  try{
    const r = await signIn(email, password);
    if(r.error){ authError = r.error; return; }
    // Only remember an email that actually worked — never the password.
    try{ if(remember){ localStorage.setItem(K_REMEMBER, JSON.stringify({email})); authPwSave(email, password); } }catch(e){}
    resetPerUserState(); // never carry the previous person's lists into this sign-in
    authBusyLabel = 'Loading your account…'; render();
    await loadProfile();
    if(!ME || (!ME.org_id && ME.role!=='superadmin')){
      authError = 'Your account isn\'t linked to a company yet. Contact your Project Manager for an invite.';
      await doSignOut();
      return;
    }
    if(ME.role==='superadmin'){ await persistSession(); go('#/'); return; }
    if(deviceLockApplies(ME)){
      authBusyLabel = 'Checking this device…'; render();
      const lock = await checkDeviceLock();
      if(!lock.ok){
        // A phone locked to someone else is refused; a new or look-alike
        // phone is held for a PM/admin to approve — see check_device_lock_v2.
        authError = deviceLockMessage(lock);
        await doSignOut();
        return;
      }
    }
    // Fix round 2 (CORE-M3): the sign-in is only saved on this device once the
    // device check has passed — closing the app mid-way leaves it signed out.
    await persistSession();
    authBusyLabel = 'Getting your sites…'; render();
    // These three don't depend on each other, so run them together instead
    // of stacking three separate timeouts one after another.
    const [, , sitesRes] = await Promise.all([loadOrg(), loadAllProfiles(true), dbSelectChecked('sites', 'select=*&order=created_at.asc')]);
    if(sitesRes.ok) SITES = sitesRes.data;
    registerPushNotifications();
    if(sitesRes.ok) saveBootSnapshot(); // a failed list fetch must not be saved as "no projects"
    warmUpLibs();
    go(homeHash());
  }catch(e){
    authError = 'Something went wrong signing you in — check your connection and try again.';
  }finally{
    authBusy = false; authBusyLabel = null; render();
  }
};

/* ---------- saved password (27 Oct 2026, Andy: "i want the logins to remember the saved password") ----------
   The password is kept encrypted (AES-GCM). The key is made by the browser as "non-extractable"
   and kept in IndexedDB: it can be used on this device but never read out, so a copy of the
   saved data on its own is useless. Where the browser has a password manager (Chrome, Edge,
   Android) it's also offered there. If this device can't do any of that, only the email is kept. */
const AUTHPW_DB = 'ophub-sec', AUTHPW_STORE = 'keys';
function authPwIdb(){
  return new Promise((res, rej)=>{
    try{
      const rq = indexedDB.open(AUTHPW_DB, 1);
      rq.onupgradeneeded = ()=>{ try{ rq.result.createObjectStore(AUTHPW_STORE); }catch(e){} };
      rq.onsuccess = ()=>res(rq.result); rq.onerror = ()=>rej(rq.error);
    }catch(e){ rej(e); }
  });
}
async function authPwKey(create){
  if(!(window.crypto && crypto.subtle && window.indexedDB)) return null;
  const db = await authPwIdb();
  const get = ()=>new Promise((res)=>{ try{ const t = db.transaction(AUTHPW_STORE, 'readonly').objectStore(AUTHPW_STORE).get('remember'); t.onsuccess = ()=>res(t.result||null); t.onerror = ()=>res(null); }catch(e){ res(null); } });
  let k = await get();
  if(!k && create){
    k = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    await new Promise((res)=>{ try{ const t = db.transaction(AUTHPW_STORE, 'readwrite').objectStore(AUTHPW_STORE).put(k, 'remember'); t.onsuccess = ()=>res(); t.onerror = ()=>res(); }catch(e){ res(); } });
  }
  return k;
}
function authB64(buf){ let s = ''; const b = new Uint8Array(buf); for(let i=0;i<b.length;i++) s += String.fromCharCode(b[i]); return btoa(s); }
function authUnB64(str){ const s = atob(str); const b = new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i] = s.charCodeAt(i); return b; }
async function authPwSave(email, password){
  try{
    const key = await authPwKey(true); if(!key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(password));
    localStorage.setItem(K_REMEMBER, JSON.stringify({email, pw:{iv:authB64(iv), ct:authB64(ct)}}));
  }catch(e){ console.warn('saved password not kept', e); }
  try{ if(window.PasswordCredential && navigator.credentials && navigator.credentials.store) await navigator.credentials.store(new PasswordCredential({id:email, password, name:email})); }catch(e){}
}
async function authPwFill(){
  try{
    const raw = localStorage.getItem(K_REMEMBER); if(!raw) return;
    const p = JSON.parse(raw); if(!p || !p.pw || !p.email) return;
    const em = document.getElementById('authEmail'), pw = document.getElementById('authPassword'); if(!em || !pw || pw.value) return;
    if(em.value && em.value.trim().toLowerCase() !== String(p.email).toLowerCase()) return;   // a different email was typed — don't fill
    const key = await authPwKey(false); if(!key) return;
    const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:authUnB64(p.pw.iv)}, key, authUnB64(p.pw.ct));
    if(document.getElementById('authPassword')===pw && !pw.value) pw.value = new TextDecoder().decode(plain);
  }catch(e){ /* key gone (browser data cleared) — just leave the box empty */ }
}
