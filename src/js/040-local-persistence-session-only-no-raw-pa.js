/* ================= local persistence (session only — no raw passwords ever stored) =================
   Keeps a signed-in user signed in across page reloads / app restarts, so
   nobody has to log back in every time — only an explicit "Sign out" clears
   this. Uses Capacitor's Preferences plugin (native storage that survives
   app restarts) when running as the native app, and localStorage on the
   plain website. */
window.storage = {
  async get(key, shared){
    try{
      if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences){
        return await window.Capacitor.Plugins.Preferences.get({key});
      }
    }catch(e){ /* fall through to localStorage */ }
    try{ return {value: localStorage.getItem(key)}; }catch(e){ return {value:null}; }
  },
  async set(key, value){
    try{
      if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences){
        await window.Capacitor.Plugins.Preferences.set({key, value});
        return true;
      }
    }catch(e){ /* fall through to localStorage */ }
    try{ localStorage.setItem(key, value); return true; }catch(e){ return false; }
  },
  async delete(key){
    try{
      if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences){
        await window.Capacitor.Plugins.Preferences.remove({key});
        return true;
      }
    }catch(e){ /* fall through to localStorage */ }
    try{ localStorage.removeItem(key); return true; }catch(e){ return false; }
  }
};
async function sget(key, shared){ try{ const r=await window.storage.get(key,shared); return r?r.value:null; }catch(e){ return null; } }
async function sset(key, value, shared){ try{ return await window.storage.set(key,value,shared);}catch(e){ console.error(e); return null; } }
async function sdelete(key, shared){ try{ return await window.storage.delete(key, shared); }catch(e){ return null; } }
async function getJSON(key, shared, fallback){ const v=await sget(key,shared); if(!v) return fallback; try{return JSON.parse(v);}catch(e){return fallback;} }
async function setJSON(key, obj, shared){ return sset(key, JSON.stringify(obj), shared); }
const K_SESSION = 'rtb-session-v1';
// Last known "who am I / my company / my sites" — lets the app paint the
// home page straight from the device on launch (and with no signal at all)
// instead of waiting on the network first. See init() / refreshBootData().
const K_BOOT = 'ophub-boot-v1';
