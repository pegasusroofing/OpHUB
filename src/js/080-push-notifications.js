/* ================= push notifications ================= */
// Registers this device for push (native app only) and saves the FCM token
// against the signed-in user so server-side reminders (e.g. the 3pm sign-out
// nudge) know where to deliver. Silently no-ops on the plain website.
let pushRegistered = false;
let pushTokenValue = null; // this phone's push token, once the OS has handed it over
// Points this phone's push token at whoever is signed in right now. Uses
// the claim_push_token database function, which also takes the token off
// anyone who was signed in on this phone before; falls back to a plain save
// if that function isn't there.
async function savePushTokenForMe(){
  if(!ME || !SESSION || !pushTokenValue) return;
  if(isEstimator(ME)) return; // estimators get no notifications, so their phone is never registered
  const platform = (window.Capacitor && window.Capacitor.getPlatform) ? window.Capacitor.getPlatform() : 'unknown';
  try{
    const res = await sbFetch('/rest/v1/rpc/claim_push_token', {method:'POST', body: JSON.stringify({p_token: pushTokenValue, p_platform: platform})});
    if(res.ok) return;
    await sbFetch('/rest/v1/push_tokens?on_conflict=token', {
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify({user_id: ME.id, token: pushTokenValue, platform, updated_at: new Date().toISOString()})
    });
  }catch(e){ console.error('Could not save push token', e); }
}
async function registerPushNotifications(){
  try{
    // Already set up on this phone during this run of the app — a different
    // person may have signed in since, so make sure the token is theirs.
    if(pushRegistered){ savePushTokenForMe(); return; }
    if(!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;
    const PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if(!PN) return;
    let perm = await PN.checkPermissions();
    if(perm.receive !== 'granted'){ perm = await PN.requestPermissions(); }
    if(perm.receive !== 'granted') return;
    pushRegistered = true;
    PN.addListener('registration', async (token)=>{
      if(!token || !token.value) return;
      pushTokenValue = token.value;
      savePushTokenForMe();
    });
    PN.addListener('registrationError', (err)=>{ console.error('Push registration error', err); });
    // Tapping a push notification (message/material/variation/snag alert)
    // jumps straight to the relevant tab on the relevant site instead of
    // just opening the app to wherever it was last left.
    PN.addListener('pushNotificationActionPerformed', (action)=>{
      try{
        const data = (action && action.notification && action.notification.data) || {};
        // A delivery notification carries the delivery's id (task_id, from
        // messages.related_id). Drivers land on their own schedule, PMs and
        // admins on that delivery; anyone else (e.g. the site contact told a
        // delivery arrived) falls through to the normal site routing below.
        if(data.task_id){
          if(ME && ME.role==='driver'){ go('#/driver'); return; }
          if(isManager(ME)){ go(`#/delivery/edit/${data.task_id}`); return; }
        }
        if(!data.site_id) return;
        const routes = { material_request:'materials', variation:'variations', snag_closed:'snagging/list', todo_assigned:'todos', price_overbooked:'price', additional_works_requested:'price', message:'messages', rams_reminder:'hs/rams', coshh_reminder:'hs/coshh', material_pickup:'materialrequired' };
        const dest = routes[data.kind] || 'messages';
        go(`#/site/${data.site_id}/${dest}`);
      }catch(e){ console.error('Push notification routing failed', e); }
    });
    await PN.register();
  }catch(e){ console.error('Push notification setup failed', e); }
}
