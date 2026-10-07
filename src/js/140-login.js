/* ================= LOGIN ================= */
let authBusy = false;
let authBusyLabel = null; // shown on the Sign In button while authBusy — kept up to date at each stage so a slow step never just looks frozen on "Please wait…"
let authError = null;
function renderLogin(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(__gen === RENDER_GEN){ app.innerHTML = shell(`
    <div class="card">
      ${authError ? `<div class="errbox">${escapeHtml(authError)}</div>` : ''}
      <div class="formfield">
        <label class="field-label">Email</label>
        <input type="email" id="authEmail" value="${escapeHtml(rememberedAuth().email)}" placeholder="you@yourcompany.co.uk">
      </div>
      <div class="formfield">
        <label class="field-label">Password</label>
        <input type="password" id="authPassword" value="${escapeHtml(rememberedAuth().password)}" placeholder="••••••••" onkeyup="maybeAutoSignIn()">
      </div>
      <label class="stub" style="display:flex;align-items:center;gap:6px;margin:2px 0 12px;"><input type="checkbox" id="authRemember" style="width:auto;" ${rememberedAuth().remember?'checked':''}>Remember my email & password on this device</label>
      <button class="primarybtn" style="background:var(--brand1);color:var(--brand1-text);border-color:var(--brand1);" ${authBusy?'disabled':''} onclick="doSignIn()">
        ${authBusy ? '<span class="spinner"></span>'+escapeHtml(authBusyLabel||'Please wait…') : 'Sign In'}
      </button>
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
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const remember = document.getElementById('authRemember') && document.getElementById('authRemember').checked;
  if(!email || !password){ authError='Enter your email and password.'; render(); return; }
  try{
    if(remember) localStorage.setItem('ophub_remember', JSON.stringify({email, password}));
    else localStorage.removeItem('ophub_remember');
  }catch(e){}
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
  authBusy = true; authBusyLabel = 'Signing in…'; authError = null; render();
  try{
    const r = await signIn(email, password);
    if(r.error){ authError = r.error; return; }
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
    const [, , sites] = await Promise.all([loadOrg(), loadAllProfiles(), dbSelect('sites', 'select=*&order=created_at.asc')]);
    SITES = sites;
    registerPushNotifications();
    saveBootSnapshot(); warmUpLibs();
    go('#/sites');
  }catch(e){
    authError = 'Something went wrong signing you in — check your connection and try again.';
  }finally{
    authBusy = false; authBusyLabel = null; render();
  }
};
