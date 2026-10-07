/* ================= JOIN (invite-only account creation) ================= */
let joinBusy = false;
let joinBusyLabel = null;
let joinError = null;
let joinInfo = undefined; // undefined = not loaded yet, null = invalid, {org_name,is_valid} = loaded
async function renderJoin(inviteId){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(joinInfo === undefined){
    if(__gen === RENDER_GEN){ app.innerHTML = shell(`<p class="stub">Checking invite…</p>`, {title:'Join OpHUB', tabs:false}); }
    joinInfo = await getInviteInfo(inviteId);
    render();
    return;
  }
  if(!joinInfo || !joinInfo.is_valid){
    if(__gen === RENDER_GEN){ app.innerHTML = shell(`
      <div class="card">
        <p class="stub" style="margin-top:0;">This invite link isn't valid — it may have already been used or expired. Ask your Project Manager for a new one.</p>
        <button class="ghostbtn" onclick="joinInfo=undefined;go('#/')">Back to Sign In</button>
      </div>
    `, {title:'Invite not valid', tabs:false}); }
    return;
  }
  // Preview the inviting company's own branding on this screen — falls back
  // to the generic OpHUB mark/colours if they haven't finished company setup yet.
  ORG = {name: joinInfo.org_name, logo_path: joinInfo.logo_path, color_primary: joinInfo.color_primary, color_secondary: joinInfo.color_secondary};
  applyTheme(ORG);
  if(__gen === RENDER_GEN){ app.innerHTML = shell(`
    <div class="card">
      <p class="stub" style="margin:0 0 12px;">You've been invited to join <b>${escapeHtml(joinInfo.org_name)}</b> on OpHUB.</p>
      ${joinError ? `<div class="errbox">${escapeHtml(joinError)}</div>` : ''}
      <div class="formfield">
        <label class="field-label">Name</label>
        <input type="text" id="joinName" placeholder="e.g. Andy Turner">
      </div>
      <div class="formfield">
        <label class="field-label">Email</label>
        <input type="email" id="joinEmail" placeholder="you@yourcompany.co.uk">
      </div>
      <div class="formfield">
        <label class="field-label">Password</label>
        <input type="password" id="joinPassword" placeholder="••••••••">
      </div>
      <button class="primarybtn" ${joinBusy?'disabled':''} onclick="doJoin('${inviteId}')">
        ${joinBusy ? '<span class="spinner"></span>'+escapeHtml(joinBusyLabel||'Please wait…') : 'Join Team'}
      </button>
    </div>
    <div style="text-align:center;margin-top:22px;">
      <img src="${orgLogoUrl(joinInfo)}" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="width:64px;height:64px;border-radius:14px;object-fit:cover;">
    </div>
  `, {title:'Join OpHUB', tabs:false}); }
}
window.doJoin = async function(inviteId){
  const name = document.getElementById('joinName').value.trim();
  const email = document.getElementById('joinEmail').value.trim();
  const password = document.getElementById('joinPassword').value;
  if(!email || !password || !name){ joinError='Fill in every field.'; render(); return; }
  if(password.length < 6){ joinError='Password needs to be at least 6 characters.'; render(); return; }
  // Same fix as doSignIn: keep the button's busy state accurate through the
  // whole multi-step chain (instead of it silently going stale the moment
  // the account is created) and wrap it so a failure anywhere shows a real
  // error rather than leaving "Please wait…" stuck on screen forever.
  joinBusy = true; joinBusyLabel = 'Creating your account…'; joinError = null; render();
  try{
    const r = await signUp(email, password, {name, invite_id: inviteId});
    if(r.error){ joinError = r.error; return; }
    if(r.confirmed){
      joinBusyLabel = 'Loading your account…'; render();
      await loadProfile();
      if(!ME || !ME.org_id){
        joinError = 'That invite couldn\'t be applied to your account — it may have just been used by someone else. Contact your Project Manager.';
        await doSignOut();
        return;
      }
      joinInfo = undefined;
      joinBusyLabel = 'Getting your sites…'; render();
      const [, , sites] = await Promise.all([loadOrg(), loadAllProfiles(), dbSelect('sites', 'select=*&order=created_at.asc')]);
      SITES = sites;
      saveBootSnapshot(); warmUpLibs();
      registerPushNotifications(); // a brand-new account was never registered for notifications until its next sign-in
      // Lock this phone to the new account now, rather than only at its next sign-in.
      if(deviceLockApplies(ME)){
        const lock = await checkDeviceLock();
        if(lock && (lock.error==='device_locked' || lock.error==='pending_approval')){
          try{ sbFetch('/functions/v1/notify-admin-signup', {method:'POST', body: JSON.stringify({})}); }catch(e){}
          await doSignOut();
          authError = 'Your account has been created. '+deviceLockMessage(lock);
          joinInfo = undefined; location.hash = ''; render();
          return;
        }
      }
      try{ sbFetch('/functions/v1/notify-admin-signup', {method:'POST', body: JSON.stringify({})}); }catch(e){ /* best-effort, silent */ }
      go('#/sites');
    } else {
      joinInfo = undefined;
      location.hash = '';
      authError = 'Account created — check your email to confirm it, then sign in.';
    }
  }catch(e){
    joinError = 'Something went wrong creating your account — check your connection and try again.';
  }finally{
    joinBusy = false; joinBusyLabel = null; render();
  }
};
