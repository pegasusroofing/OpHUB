/* ================= auth ================= */
// `extra` becomes the new account's auth metadata. Only `invite_id` matters
// server-side: the handle_new_user() DB trigger looks it up in the `invites`
// table and resolves org_id/role from THAT row — anything else sent here
// (e.g. a role) is display-only and is never trusted by the backend.
async function signUp(email, password, extra){
  // Normalize so "Andy@x.com" and "andy@x.com" are treated as the same
  // account. Without this, Supabase's email-uniqueness check is
  // case-sensitive and two signups that differ only by capitalization can
  // both succeed, producing two separate accounts for what is really one
  // email address.
  email = String(email||'').trim().toLowerCase();
  let res;
  try{
    res = await fetchWithTimeout(SUPABASE_URL+'/auth/v1/signup', {
      method:'POST',
      headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({email, password, data: extra||{}})
    }, 15000);
  }catch(e){ return {error:'Could not reach the server — check your connection and try again.'}; }
  const d = await res.json();
  if(!res.ok) return {error: d.msg||d.error_description||d.error||'Sign up failed'};
  if(d.access_token){
    SESSION = {access_token:d.access_token, refresh_token:d.refresh_token, expires_at:Date.now()+(d.expires_in*1000), user:{id:d.user.id, email:d.user.email}};
    await setJSON(K_SESSION, SESSION, false);
    return {ok:true, confirmed:true};
  }
  return {ok:true, confirmed:false};
}
async function getInviteInfo(inviteId){
  const res = await sbFetch('/rest/v1/rpc/get_invite_info', {method:'POST', body: JSON.stringify({p_invite_id: inviteId})});
  if(!res.ok) return null;
  const rows = await res.json();
  return rows && rows[0] ? rows[0] : null;
}
async function signIn(email, password){
  // Same normalization as signUp() — matches regardless of how the email
  // was capitalized when the account was created or is being typed now.
  email = String(email||'').trim().toLowerCase();
  let res;
  try{
    res = await fetchWithTimeout(SUPABASE_URL+'/auth/v1/token?grant_type=password', {
      method:'POST',
      headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({email, password})
    }, 15000);
  }catch(e){ return {error:'Could not reach the server — check your connection and try again.'}; }
  const d = await res.json();
  if(!res.ok) return {error: d.msg||d.error_description||d.error||'Sign in failed'};
  SESSION = {access_token:d.access_token, refresh_token:d.refresh_token, expires_at:Date.now()+(d.expires_in*1000), user:{id:d.user.id, email:d.user.email}};
  await setJSON(K_SESSION, SESSION, false);
  return {ok:true};
}
// One phone/browser profile = one operative. The first operative to sign
// in on a device locks it to them (via the check_and_lock_device DB
// function); anyone else signing in as a different operative on that same
// device gets blocked, closing the "use my mate's phone to check in" gap.
// PMs/admins are exempt — see the role check at the call site.
async function checkDeviceLock(){
  try{
    const res = await sbFetch('/rest/v1/rpc/check_device_lock_v2', {method:'POST', body: JSON.stringify({p_device_id: getDeviceId(), p_hw_id: getHardwareId()})});
    if(!res.ok) return {ok:false, error:'request_failed'};
    return await res.json();
  }catch(e){ return {ok:false, error:'request_failed'}; }
}
window.doSignOut = async function(){
  // Signing out stops this phone getting the outgoing person's notifications.
  if(pushTokenValue && SESSION){ try{ await sbFetch('/rest/v1/push_tokens?token=eq.'+encodeURIComponent(pushTokenValue), {method:'DELETE', timeoutMs:6000}); }catch(e){} }
  try{ await sbFetch('/auth/v1/logout', {method:'POST', timeoutMs:6000}); }catch(e){}
  SESSION = null; ME = null; ORG = null;
  hsPolicyGateChecked = false; hsPolicyGatePending = false; // re-check fresh for whoever signs in next
  homeExtras = {uid:null, onboarding:null, count:0, at:0, loading:false};
  applyTheme(null);
  await sdelete(K_SESSION, false);
  await sdelete(K_BOOT, false);
  await clearOfflineCache();
  location.hash = '';
  render();
};
async function loadProfile(){
  const qs = 'id=eq.'+SESSION.user.id+'&select=*';
  const r = await dbSelectChecked('profiles', qs);
  if(r.ok){ ME = r.data[0] || null; return; }
  // The request failed (no signal, server blip) — that is not the same as
  // "this account doesn't exist". Fall back to the last copy we have rather
  // than dropping a signed-in user back to the login screen.
  const cached = await getCachedRows('profiles', qs);
  if(cached && cached.data && cached.data[0]) ME = cached.data[0];
  else if(!(ME && SESSION && ME.id===SESSION.user.id)) ME = null;
}
