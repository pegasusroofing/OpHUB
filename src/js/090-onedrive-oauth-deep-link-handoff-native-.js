/* ================= OneDrive OAuth deep-link handoff (native app only) =================
   The OneDrive "Connected"/"Connection failed" page (served from Supabase, in
   the system browser Browser.open() opened) redirects to ophub://onedrive-callback
   once it's done — iOS/Android route that straight back into this app and
   auto-dismiss the system browser, so nobody has to tap "Close Window"
   themselves. This just needs to catch that hand-off and refresh the screen. */
function registerOneDriveDeepLinkHandler(){
  if(!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;
  const AppPlugin = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if(!AppPlugin) return;
  AppPlugin.addListener('appUrlOpen', async (data)=>{
    try{
      const openedUrl = new URL(data.url);
      if(openedUrl.protocol !== 'ophub:' || openedUrl.hostname !== 'onedrive-callback') return;
      if(window.Capacitor.Plugins.Browser){ try{ await window.Capacitor.Plugins.Browser.close(); }catch(e){} }
      const status = openedUrl.searchParams.get('status');
      toast(status==='success' ? 'OneDrive connected' : 'OneDrive connection failed — try again.');
      go('#/team');
    }catch(e){ console.error('OneDrive deep link handling failed', e); }
  });
}
