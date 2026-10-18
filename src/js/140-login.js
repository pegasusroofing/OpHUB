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
  const o = {}; q.split('&').forEach(kv=>{ const i = kv.indexOf('='); if(i>0) o[decodeURIComponent(kv.slice(0,i))] = decodeURIComponent(kv.slice(i+1)); });
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
    try{ const r = JSON.parse(localStorage.getItem('ophub_remember')||'null'); if(r && r.email && authPrefillEmail && r.email.toLowerCase()===authPrefillEmail.toLowerCase()) localStorage.removeItem('ophub_remember'); }catch(e){}
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
      <div class="formfield">
        <label class="field-label">Email</label>
        <input type="email" id="authEmail" value="${escapeHtml(authPrefillEmail || rememberedAuth().email)}" placeholder="you@yourcompany.co.uk">
      </div>
      <div class="formfield">
        <label class="field-label">Password</label>
        <input type="password" id="authPassword" value="${escapeHtml(authPrefillEmail && authPrefillEmail.toLowerCase()!==String(rememberedAuth().email||'').toLowerCase() ? '' : rememberedAuth().password)}" placeholder="••••••••" onkeyup="maybeAutoSignIn()">
      </div>
      <label class="stub" style="display:flex;align-items:center;gap:6px;margin:2px 0 12px;"><input type="checkbox" id="authRemember" style="width:auto;" ${rememberedAuth().remember?'checked':''}>Remember my email & password on this device</label>
      <button class="primarybtn" style="background:var(--brand1);color:var(--brand1-text);border-color:var(--brand1);" ${authBusy?'disabled':''} onclick="doSignIn()">
        ${authBusy ? '<span class="spinner"></span>'+escapeHtml(authBusyLabel||'Please wait…') : 'Sign In'}
      </button>
      <p style="text-align:center;margin:12px 0 0;"><span class="viewlink" style="cursor:pointer;font-weight:700;" onclick="forgotPassword()">Forgot password?</span></p>
      <p class="stub" style="margin-top:10px;">Real Supabase account — password is never seen or stored by our servers. Ticking "Remember" saves it on this device only, so only use it on a phone/computer that's yours alone.</p>
      <p class="stub" style="margin-top:14px;">New team member? You'll need an invite link from your Project Manager to create an account — sign-up isn't open to the public.</p>
    </div>
    <div style="display:flex;justify-content:center;margin-top:22px;">
      <img src="${orgLogoUrl(ORG)}" alt="OpHUB" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="width:226.8px;height:226.8px;border-radius:32.4px;object-fit:cover;box-shadow:0 3.6px 16.2px rgba(0,0,0,0.12);max-width:75vw;max-height:75vw;">
    </div>
  `, {centerTitle:true, tabs:false}); }
}
window.maybeAutoSignIn = function(ev){
  // Only Enter submits — a bare "fields look filled" trigger caused false
  // sign-ins whenever the browser's saved-password autofill populated the
  // form (e.g. switching accounts on a shared device), signing people in as
  // whoever was saved before they could change the email. Explicit Sign In
  // click or Enter key only, from here on.
  if(ev && ev.key === 'Enter'){ doSignIn(); }
};
// "Remember me" on the sign-in page — stored in localStorage, on-device
// only, and never sent anywhere except back into these two fields. Opt-in
// via the checkbox; unticking it (or a fresh sign-in without it checked)
// clears whatever was saved.
function rememberedAuth(){
  try{
    const raw = localStorage.getItem('ophub_remember');
    if(!raw) return {email:'', password:'', remember:false};
    const parsed = JSON.parse(raw);
    return {email: parsed.email||'', password: parsed.password||'', remember:true};
  }catch(e){ return {email:'', password:'', remember:false}; }
}
window.doSignIn = async function(){
  if(authBusy) return; // Enter key + button tap at the same time used to start two sign-ins
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const remember = document.getElementById('authRemember') && document.getElementById('authRemember').checked;
  authPrefillEmail = email; // keep what they typed if the password's wrong
  if(!email || !password){ authError='Enter your email and password.'; render(); return; }
  try{ if(!remember) localStorage.removeItem('ophub_remember'); }catch(e){}
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
    // Only remember a password that actually worked.
    try{ if(remember) localStorage.setItem('ophub_remember', JSON.stringify({email, password})); }catch(e){}
    resetPerUserState(); // never carry the previous person's lists into this sign-in
    authBusyLabel = 'Loading your account…'; render();
    await loadProfile();
    if(!ME || (!ME.org_id && ME.role!=='superadmin')){
      authError = 'Your account isn\'t linked to a company yet. Contact your Project Manager for an invite.';
      await doSignOut();
      return;
    }
    if(ME.role==='superadmin'){ go('#/'); return; }
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
